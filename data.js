
"use strict";

const STORAGE_KEY = "watchTracker_v2";

const MEDIA_TYPES = [
  "Film","TV Series","Anime","Animation",
  "Documentary","Short Film","Web Series",
  "Special","Other"
];

const COLLECTION_NAMES = {
  group:"groups",
  production:"productions",
  season:"seasons",
  episode:"episodes"
};

function emptyDatabase() {
  return {
    groups:[],
    productions:[],
    seasons:[],
    episodes:[],
    watchlist:[]
  };
}

function loadDatabase() {
  try {
    const data = JSON.parse(
      localStorage.getItem(STORAGE_KEY) || "{}"
    );
    const result = emptyDatabase();

    for (const key of Object.keys(result)) {
      result[key] = Array.isArray(data[key])
        ? data[key] : [];
    }

    return result;
  } catch (error) {
    console.error(error);
    return emptyDatabase();
  }
}

let trackerData = loadDatabase();

function saveDatabase() {
  try {
    localStorage.setItem(
      STORAGE_KEY,JSON.stringify(trackerData)
    );
    return true;
  } catch (error) {
    console.error(error);
    alert("Browser storage is full or unavailable.");
    return false;
  }
}

function createId() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : Date.now().toString(36) +
      Math.random().toString(36).slice(2);
}

function getCollection(type) {
  return trackerData[COLLECTION_NAMES[type]] || [];
}

function findEntry(type,id) {
  return getCollection(type).find(x=>x.id===id);
}

function createEntry(type,values={}) {
  if (!COLLECTION_NAMES[type]) return null;

  const entry = {
    id:createId(),
    type,
    title:"",
    medium:"",
    parentId:"",
    episodeNumber:null,
    release:"",
    airingDate:"",
    watchedDate:"",
    duration:null,
    rating:null,
    mainGenres:[],
    secondaryGenres:[],
    notes:"",
    createdAt:Date.now(),
    updatedAt:Date.now(),
    ...values
  };

  getCollection(type).push(entry);
  saveDatabase();
  return entry;
}

function updateEntry(type,id,values) {
  const entry=findEntry(type,id);
  if(!entry)return null;

  Object.assign(entry,values,{
    updatedAt:Date.now()
  });
  saveDatabase();
  return entry;
}

function getChildren(type,id) {
  const childType={
    group:"production",
    production:"season",
    season:"episode"
  }[type];

  return childType
    ? getCollection(childType).filter(x=>x.parentId===id)
    : [];
}

function removeEntry(type,id,save=true) {
  if(type==="group"){
    trackerData.productions.forEach(p=>{
      if(p.parentId===id)p.parentId="";
    });
  }

  if(type==="production"||type==="season"){
    getChildren(type,id).slice().forEach(child=>
      removeEntry(child.type,child.id,false)
    );
  }

  const collection=getCollection(type);
  const index=collection.findIndex(x=>x.id===id);
  if(index>=0)collection.splice(index,1);
  if(save)saveDatabase();
}

function allEntries() {
  return [
    ...trackerData.groups,
    ...trackerData.productions,
    ...trackerData.seasons,
    ...trackerData.episodes
  ];
}

function parentTypeOf(type) {
  return {
    production:"group",
    season:"production",
    episode:"season"
  }[type]||null;
}

function effectiveMedium(item) {
  if(!item)return "";
  if(item.type==="production")return item.medium||"";
  const parentType=parentTypeOf(item.type);
  return parentType&&item.parentId
    ? effectiveMedium(findEntry(parentType,item.parentId))
    : "";
}

/* RATINGS */

function validManualRating(value) {
  if(value===null||value===undefined||value==="")
    return null;

  const number=Number(value);
  return Number.isFinite(number)&&number>=0&&number<=10
    ? number : null;
}

function averageRatings(children) {
  const ratings=children.map(effectiveRating)
    .filter(x=>x!==null);

  return ratings.length
    ? ratings.reduce((a,b)=>a+b,0)/ratings.length
    : null;
}

function effectiveRating(item) {
  if(!item)return null;

  if(item.type==="episode")
    return validManualRating(item.rating);

  if(item.type==="season")
    return averageRatings(getChildren("season",item.id));

  if(item.type==="production"){
    const seasons=getChildren("production",item.id);
    return seasons.length
      ? averageRatings(seasons)
      : validManualRating(item.rating);
  }

  if(item.type==="group")
    return averageRatings(getChildren("group",item.id));

  return null;
}

function canRateManually(type,id=null) {
  return type==="episode" ||
    (type==="production" &&
     (!id||getChildren("production",id).length===0));
}

function normalizeHalfRating(value) {
  const number=validManualRating(value);
  return number===null
    ? null
    : Math.round(number*2)/2;
}

/* GENRES */

function cleanGenreArray(value) {
  const seen=new Set();
  return (Array.isArray(value)?value:[])
    .map(x=>String(x).trim())
    .filter(x=>{
      const key=x.toLowerCase();
      if(!key||seen.has(key))return false;
      seen.add(key);
      return true;
    });
}

function effectiveGenres(item) {
  const empty={mainGenres:[],secondaryGenres:[]};
  if(!item||item.type==="episode")return empty;

  if(item.type==="production"){
    return {
      mainGenres:cleanGenreArray(item.mainGenres),
      secondaryGenres:cleanGenreArray(item.secondaryGenres)
    };
  }

  if(item.type==="season")
    return effectiveGenres(
      findEntry("production",item.parentId)
    );

  if(item.type==="group"){
    const children=getChildren("group",item.id);
    const values=children.map(effectiveGenres);

    function collect(key) {
      const found=new Map();
      values.forEach(v=>v[key].forEach(g=>{
        if(!found.has(g.toLowerCase()))
          found.set(g.toLowerCase(),g);
      }));
      return [...found.values()];
    }

    const main=collect("mainGenres");
    const mainKeys=new Set(main.map(g=>g.toLowerCase()));

    return {
      mainGenres:main,
      secondaryGenres:collect("secondaryGenres")
        .filter(g=>!mainKeys.has(g.toLowerCase()))
    };
  }

  return empty;
}

function genreList(item,mode="both") {
  const genres=effectiveGenres(item);

  const values=mode==="main"
    ? genres.mainGenres
    : mode==="secondary"
      ? genres.secondaryGenres
      : [...genres.mainGenres,...genres.secondaryGenres];

  const found=new Map();
  values.forEach(g=>{
    const key=g.toLowerCase();
    if(!found.has(key))found.set(key,g);
  });
  return [...found.values()];
}

/* HIERARCHY LABELS */

function productionFor(item) {
  if(!item)return null;

  if(item.type==="production")return item;

  if(item.type==="season")
    return findEntry("production",item.parentId);

  if(item.type==="episode"){
    const season=findEntry("season",item.parentId);
    return season
      ? findEntry("production",season.parentId)
      : null;
  }

  return null;
}

function contextualTitle(item) {
  if(!item)return "";

  if(item.type==="group"||item.type==="production")
    return item.title||"Untitled";

  const production=productionFor(item);
  const prefix=production
    ? `(${production.title}) ` : "";

  if(item.type==="season")
    return prefix+(item.title||"Untitled Season");

  const season=findEntry("season",item.parentId);
  const seasons=production
    ? getChildren("production",production.id) : [];

  const seasonIndex=season
    ? seasons.slice().sort((a,b)=>a.createdAt-b.createdAt)
        .findIndex(s=>s.id===season.id)+1
    : 0;

  const number=item.episodeNumber!=null
    ? `E${item.episodeNumber}`
    : "Episode";

  const label=seasonIndex>0
    ? `S${seasonIndex} ${number}`
    : number;

  return `${prefix}${label} — ${item.title||"Untitled"}`;
}

/* RUNTIME & EPISODE COUNTS */

function directMinutes(item) {
  const n=Number(item?.duration);
  return item?.duration!=null &&
    Number.isFinite(n)&&n>=0 ? n : null;
}

function totalLength(item) {
  if(!item)return 0;

  if(item.type==="episode")
    return directMinutes(item)||0;

  if(item.type==="season"){
    const children=getChildren("season",item.id);
    const known=children
      .map(directMinutes)
      .filter(x=>x!==null);

    if(known.length)
      return known.reduce((a,b)=>a+b,0);

    return directMinutes(item)||0;
  }

  if(item.type==="production"){
    const seasons=getChildren("production",item.id);
    if(!seasons.length)return directMinutes(item)||0;

    const known=seasons.some(s=>
      directMinutes(s)!==null ||
      getChildren("season",s.id).some(e=>
        directMinutes(e)!==null
      )
    );

    return known
      ? seasons.reduce((a,s)=>a+totalLength(s),0)
      : directMinutes(item)||0;
  }

  if(item.type==="group")
    return getChildren("group",item.id)
      .reduce((a,p)=>a+totalLength(p),0);

  return 0;
}

function episodeCount(item) {
  if(!item)return 0;

  if(item.type==="episode")return 1;

  if(item.type==="season")
    return getChildren("season",item.id).length;

  if(item.type==="production")
    return getChildren("production",item.id)
      .reduce((n,s)=>n+episodeCount(s),0);

  if(item.type==="group")
    return getChildren("group",item.id)
      .reduce((n,p)=>n+episodeCount(p),0);

  return 0;
}

/* FLEXIBLE DATES */

/*
  Accepted examples:
  13.03.26
  13.03.2026
  13 March 2026
  July 2004
  07.2004
  2004

  Uncertain day/month remains uncertain.
  Two-digit years refer to 2000–2099.
*/

const MONTH_NAMES=[
  "January","February","March","April","May","June",
  "July","August","September","October","November","December"
];

function makeDateParts(year,month=null,day=null) {
  if(!Number.isInteger(year)||year<1||year>9999)
    return null;

  if(month!==null &&
     (!Number.isInteger(month)||month<1||month>12))
    return null;

  if(day!==null){
    if(month===null)return null;
    const test=new Date(Date.UTC(year,month-1,day));

    if(test.getUTCFullYear()!==year ||
       test.getUTCMonth()!==month-1 ||
       test.getUTCDate()!==day)return null;
  }

  const two=n=>String(n).padStart(2,"0");
  const yearText=String(year).padStart(4,"0");

  return {
    year,month,day,
    precision:day!==null?"day":month!==null?"month":"year",
    key:yearText+
      (month!==null?"-"+two(month):"")+
      (day!==null?"-"+two(day):""),
    timestamp:Date.UTC(year,(month||1)-1,day||1)
  };
}

function parseTrackerDate(input) {
  if(typeof input!=="string")return null;
  const s=input.trim();
  if(!s)return null;

  let m=s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})\.?$/);

  if(m){
    let year=Number(m[3]);
    if(m[3].length===2)year+=2000;
    return makeDateParts(year,Number(m[2]),Number(m[1]));
  }

  m=s.match(/^(\d{1,2})[./-](\d{4})$/);
  if(m)return makeDateParts(Number(m[2]),Number(m[1]));

  m=s.match(/^(\d{4})$/);
  if(m)return makeDateParts(Number(m[1]));

  const names=MONTH_NAMES.join("|");
  const monthPattern=new RegExp(
    "^(\\d{1,2})\\s+("+names+")\\s+(\\d{4})$","i"
  );

  m=s.match(monthPattern);
  if(m){
    const index=MONTH_NAMES.findIndex(x=>
      x.toLowerCase()===m[2].toLowerCase()
    );
    return makeDateParts(Number(m[3]),index+1,Number(m[1]));
  }

  const monthYearPattern=new RegExp(
    "^("+names+")\\s+(\\d{4})$","i"
  );

  m=s.match(monthYearPattern);
  if(m){
    const index=MONTH_NAMES.findIndex(x=>
      x.toLowerCase()===m[1].toLowerCase()
    );
    return makeDateParts(Number(m[2]),index+1);
  }

  return null;
}

function validTrackerDate(input) {
  return !String(input||"").trim() ||
    !!parseTrackerDate(input);
}

function productionHasSeasons(production) {
  return !!production &&
    getChildren("production",production.id).length>0;
}

function allowsAiringDate(type,id=null) {
  return type==="season" ||
    (type==="production" &&
      (!id||!productionHasSeasons(
        findEntry("production",id)
      )));
}

function allowsWatchingDate(type,id=null) {
  return type==="episode" ||
    (type==="production" &&
      (!id||!productionHasSeasons(
        findEntry("production",id)
      )));
}

function effectiveAiringDate(item) {
  if(!item||!allowsAiringDate(item.type,item.id))
    return "";
  return item.airingDate||item.release||"";
}

function effectiveWatchingDate(item) {
  if(!item||!allowsWatchingDate(item.type,item.id))
    return "";
  return item.watchedDate||"";
}

function releaseTimestamp(input) {
  return parseTrackerDate(input)?.timestamp??null;
}

/* BANNER STORAGE */

const imageDatabasePromise=new Promise(resolve=>{
  if(!("indexedDB" in window)){
    resolve(null);
    return;
  }

  const request=indexedDB.open("watchTrackerImages",1);

  request.onupgradeneeded=()=>{
    if(!request.result.objectStoreNames.contains("images"))
      request.result.createObjectStore("images");
  };

  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>resolve(null);
});

async function imageTransaction(key,mode,value) {
  const db=await imageDatabasePromise;

  if(!db){
    if(mode==="readonly")return null;
    throw new Error("Image database unavailable");
  }

  return new Promise((resolve,reject)=>{
    const transaction=db.transaction("images",mode);
    const store=transaction.objectStore("images");

    const request=mode==="readonly"
      ? store.get(key)
      : value===null
        ? store.delete(key)
        : store.put(value,key);

    request.onsuccess=()=>resolve(
      mode==="readonly"?request.result||null:true
    );

    request.onerror=()=>reject(request.error);
  });
}

function imageKey(type,id) {
  return type+":"+id;
}

function saveImage(type,id,blob) {
  return imageTransaction(imageKey(type,id),"readwrite",blob);
}

function loadImage(type,id) {
  return imageTransaction(imageKey(type,id),"readonly");
}

function deleteImage(type,id) {
  return imageTransaction(imageKey(type,id),"readwrite",null);
}

const imageURLs=new Map();

async function getImageURL(type,id) {
  const key=imageKey(type,id);
  if(imageURLs.has(key))return imageURLs.get(key);

  const blob=await loadImage(type,id);
  if(!blob)return null;

  const url=URL.createObjectURL(blob);
  imageURLs.set(key,url);
  return url;
}

function invalidateImageURL(type,id) {
  const key=imageKey(type,id);
  const url=imageURLs.get(key);
  if(url)URL.revokeObjectURL(url);
  imageURLs.delete(key);
}
