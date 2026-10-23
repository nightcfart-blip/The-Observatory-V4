
"use strict";

const $=id=>document.getElementById(id);

const TYPE_NAMES={
  group:"Group",
  production:"Production",
  season:"Season",
  episode:"Episode"
};

const SYMBOLS={
  group:"◇",production:"✦",season:"◈",episode:"✧"
};

const GOLD_COLORS=[
  "#f3dda0","#c99e59","#997342","#ead1a0",
  "#796b57","#b5a183","#876e48","#dcc080"
];

const state={
  rotation:0,
  velocity:0,
  dragging:false,
  pointerId:null,
  moved:false,
  startX:0,
  startY:0,
  lastAngle:0,
  lastTime:0,
  currentPage:"home",
  detailType:null,
  detailId:null,
  editType:null,
  editId:null,
  pendingImage:undefined,
  previewURL:null,
  chartRows:[],
  chartSelected:null,
  chartVisible:30
};

const METRICS={
  watchTime:{
    name:"Total Watch Time",
    diagrams:["line","stacked","treemap","ranked"]
  },
  media:{
    name:"Media Breakdown",
    diagrams:["donut","stacked","treemap","ranked"]
  },
  genres:{
    name:"Genre Distribution",
    diagrams:["donut","stacked","treemap","radar","ranked"]
  },
  overlap:{
    name:"Genre Overlapping",
    diagrams:["venn","upset","chord","network","ranked"]
  },
  ratings:{
    name:"Rating Distribution",
    diagrams:["histogram","box","stacked"]
  },
  highest:{
    name:"Highest Rated",
    diagrams:["ranked","scatter"]
  },
  lowest:{
    name:"Lowest Rated",
    diagrams:["ranked","scatter"]
  }
};

const DIAGRAMS={
  line:"Line Graph",
  donut:"Donut Chart",
  stacked:"Stacked Bar Chart",
  treemap:"Treemap",
  radar:"Radar Chart",
  venn:"Venn Diagram",
  upset:"UpSet Plot",
  chord:"Chord Diagram",
  network:"Network Graph",
  histogram:"Histogram",
  box:"Box and Whisker Plot",
  ranked:"Ranked Horizontal Bar Chart",
  scatter:"Scatter Plot"
};

document.addEventListener("DOMContentLoaded",init);

function init(){
  setupCompass();
  setupNavigation();
  setupCreation();
  setupEditor();
  setupDetails();
  setupLibrary();
  setupWatchlist();
  setupStatistics();
  fillMediaSelectors();
  fillRatingSelector();
  renderLibrary();
  renderWatchlist();
}

/* HELPERS */

function el(tag,className="",text){
  const e=document.createElement(tag);
  if(className)e.className=className;
  if(text!==undefined)e.textContent=text;
  return e;
}

function clear(node){node.replaceChildren()}

function emptyMessage(message){
  return el("div","empty-state",message);
}

function optionalNumber(id){
  const value=$(id).value.trim();
  if(!value)return null;
  const n=Number(value);
  return Number.isFinite(n)?n:null;
}

function parseGenres(text){
  const found=new Map();
  text.split(",").forEach(v=>{
    const name=v.trim();
    if(name&&!found.has(name.toLowerCase()))
      found.set(name.toLowerCase(),name);
  });
  return [...found.values()];
}

function formatMinutes(value){
  const n=Math.round(value||0);
  return `${Math.floor(n/60)}h ${n%60}m`;
}

function parentName(item){
  const type=parentTypeOf(item.type);
  return type&&item.parentId
    ? findEntry(type,item.parentId)?.title||""
    : "";
}

function descendants(item){
  const result=[];
  const walk=parent=>{
    getChildren(parent.type,parent.id).forEach(child=>{
      result.push(child);
      walk(child);
    });
  };
  walk(item);
  return result;
}

function imageInto(container,item){
  getImageURL(item.type,item.id).then(url=>{
    if(!url||!container.isConnected)return;
    const img=new Image();
    img.alt="";
    img.src=url;
    container.replaceChildren(img);
  }).catch(console.error);
}

function escapeXML(value){
  return String(value??"").replace(/[&<>"']/g,ch=>({
    "&":"&amp;",
    "<":"&lt;",
    ">":"&gt;",
    '"':"&quot;",
    "'":"&#39;"
  })[ch]);
}

/* COMPASS */

function setupCompass(){
  const wrap=$("compassWrap");
  const compass=$("compass");

  const rotate=value=>{
    state.rotation=value;
    compass.style.transform=`rotate(${value}deg)`;
  };

  const angle=(x,y)=>{
    const r=wrap.getBoundingClientRect();
    return Math.atan2(
      y-r.top-r.height/2,
      x-r.left-r.width/2
    )*180/Math.PI;
  };

  const diff=(a,b)=>((a-b+540)%360)-180;

  wrap.addEventListener("pointerdown",e=>{
    if(state.dragging)return;
    state.dragging=true;
    state.pointerId=e.pointerId;
    state.moved=false;
    state.velocity=0;
    state.startX=e.clientX;
    state.startY=e.clientY;
    state.lastAngle=angle(e.clientX,e.clientY);
    state.lastTime=performance.now();
    wrap.setPointerCapture(e.pointerId);
  });

  wrap.addEventListener("pointermove",e=>{
    if(!state.dragging||state.pointerId!==e.pointerId)return;

    if(Math.hypot(
      e.clientX-state.startX,
      e.clientY-state.startY
    )>7)state.moved=true;

    if(!state.moved)return;

    const now=performance.now();
    const current=angle(e.clientX,e.clientY);
    const change=diff(current,state.lastAngle);
    const elapsed=Math.max(now-state.lastTime,1);

    rotate(state.rotation+change);

    state.velocity=Math.max(-15,Math.min(15,
      change/elapsed*16
    ));

    state.lastAngle=current;
    state.lastTime=now;
  });

  function finish(e,cancelled=false){
    if(!state.dragging||state.pointerId!==e.pointerId)return;

    const moved=state.moved;
    state.dragging=false;
    state.pointerId=null;

    if(wrap.hasPointerCapture(e.pointerId))
      wrap.releasePointerCapture(e.pointerId);

    if(cancelled)state.velocity=0;
    else if(!moved){
      state.velocity=0;
      activateTip(e.clientX,e.clientY);
    }
  }

  wrap.addEventListener("pointerup",e=>finish(e));
  wrap.addEventListener("pointercancel",e=>finish(e,true));

  function activateTip(x,y){
    const r=wrap.getBoundingClientRect();
    const dx=x-r.left-r.width/2;
    const dy=y-r.top-r.height/2;
    const radius=Math.hypot(dx,dy)/r.width;

    if(radius<.26||radius>.52)return;

    const current=(Math.atan2(dy,dx)*180/Math.PI-
      state.rotation+36000)%360;

    const points=[
      [270,"watchlist"],[0,"creation"],
      [90,"library"],[180,"statistics"]
    ];

    const match=points.find(([a])=>
      Math.abs(diff(current,a))<=15
    );

    if(match)openPage(match[1]);
  }

  document.querySelectorAll(".tip").forEach(tip=>{
    tip.addEventListener("click",e=>{
      if(e.detail===0)openPage(tip.dataset.page);
    });
  });

  wrap.addEventListener("wheel",e=>{
    e.preventDefault();
    state.velocity+=Math.max(-5,Math.min(5,e.deltaY*.012));
  },{passive:false});

  let previous=performance.now();

  function frame(now){
    const factor=Math.min((now-previous)/16.667,3);
    previous=now;

    if(!state.dragging&&Math.abs(state.velocity)>.015){
      rotate(state.rotation+state.velocity*factor);
      state.velocity*=Math.pow(.955,factor);
    }

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

/* PAGE NAVIGATION */

function openPage(name){
  state.currentPage=name;

  document.querySelectorAll(".page").forEach(p=>
    p.classList.remove("active")
  );

  $("homePage").classList.add("hidden");
  $(name+"Page")?.classList.add("active");

  if(name==="library")renderLibrary();
  if(name==="watchlist")renderWatchlist();
  if(name==="statistics")renderStatistics();
}

function goHome(){
  state.currentPage="home";
  document.querySelectorAll(".page").forEach(p=>
    p.classList.remove("active")
  );
  $("homePage").classList.remove("hidden");
}

function setupNavigation(){
  document.querySelectorAll("[data-back]").forEach(b=>
    b.onclick=goHome
  );
  $("libraryAddBtn").onclick=()=>openPage("creation");
}

/* EDITOR OPTIONS */

function fillMediaSelectors(){
  ["editMedium","watchMedium"].forEach(id=>{
    const select=$(id);
    clear(select);
    select.add(new Option(
      id==="watchMedium"
        ?"Media type (optional)"
        :"Not specified",
      ""
    ));
    MEDIA_TYPES.forEach(m=>select.add(new Option(m,m)));
  });
}

function fillRatingSelector(){
  const select=$("editRating");
  clear(select);
  select.add(new Option("Unrated",""));

  for(let i=0;i<=20;i++){
    const rating=i/2;
    select.add(new Option(rating.toFixed(1),String(rating)));
  }
}

function makeStars(container,rating,interactive=false){
  clear(container);

  for(let i=1;i<=10;i++){
    const star=el(interactive?"button":"span",
      interactive?"edit-star":"display-star");

    if(interactive)star.type="button";

    const base=el("span","star-base","★");
    const fill=el("span","star-fill","★");

    const portion=rating===null?0:
      Math.max(0,Math.min(1,rating-i+1));

    fill.style.setProperty("--fill",portion*100+"%");
    star.append(base,fill);

    if(interactive){
      star.setAttribute("aria-label",`Rate ${i-.5} or ${i}`);

      star.onclick=e=>{
        const r=star.getBoundingClientRect();
        const choice=e.clientX-r.left<r.width/2?i-.5:i;
        $("editRating").value=String(choice);
        renderStarEditor();
      };
    }

    container.appendChild(star);
  }
}

function renderStarEditor(){
  makeStars($("starRating"),
    optionalNumber("editRating")??0,true);
}

function setupCreation(){
  document.querySelectorAll("[data-create]").forEach(b=>{
    b.onclick=()=>openEditor(b.dataset.create);
  });
}

/* EDITING */

function setupEditor(){
  $("cancelEditor").onclick=closeEditor;
  $("saveEditor").onclick=()=>$("editorForm").requestSubmit();

  $("editorForm").onsubmit=async e=>{
    e.preventDefault();
    await saveEditor();
  };

  $("editRating").onchange=renderStarEditor;
  $("editParent").onchange=updateInheritedGenrePreview;
  $("deleteEntryBtn").onclick=deleteCurrentEntry;

  $("bannerInput").onchange=e=>{
    const file=e.target.files?.[0];
    if(!file)return;
    if(!file.type.startsWith("image/")){
      alert("Please select an image.");
      return;
    }
    state.pendingImage=file;
    showPreview(file);
  };

  $("removeBanner").onclick=()=>{
    state.pendingImage=null;
    clearPreview();
    $("bannerPreview").textContent="No banner";
    $("bannerInput").value="";
  };

  $("editorOverlay").onclick=e=>{
    if(e.target===$("editorOverlay"))closeEditor();
  };
}

function clearPreview(){
  if(state.previewURL)URL.revokeObjectURL(state.previewURL);
  state.previewURL=null;
}

function showPreview(blob){
  clearPreview();
  state.previewURL=URL.createObjectURL(blob);
  const image=new Image();
  image.alt="Banner preview";
  image.src=state.previewURL;
  $("bannerPreview").replaceChildren(image);
}

function fillParentSelector(type,id){
  const select=$("editParent");
  clear(select);
  const parentType=parentTypeOf(type);
  if(!parentType)return;

  $("parentLabel").textContent=
    TYPE_NAMES[parentType]+
    (type==="production"?" (optional)":"");

  select.add(new Option(
    type==="production"
      ?"Independent Production"
      :"Select "+TYPE_NAMES[parentType],
    ""
  ));

  getCollection(parentType).forEach(p=>
    select.add(new Option(p.title,p.id))
  );
  select.value=id||"";
}

async function openEditor(type,id=null,parentId=""){
  const entry=id?findEntry(type,id):null;
  if(id&&!entry)return;

  state.editType=type;
  state.editId=id;
  state.pendingImage=undefined;

  $("editorForm").reset();
  clearPreview();
  $("bannerInput").value="";

  $("editId").value=id||"";
  $("editType").value=type;
  $("editorHeading").textContent=
    (entry?"Edit ":"Create ")+TYPE_NAMES[type];

  $("editTitle").value=entry?.title||"";
  $("editMedium").value=entry?.medium||"";
  $("editDuration").value=entry?.duration??"";
  $("editEpisodeNumber").value=entry?.episodeNumber??"";
  $("editNotes").value=entry?.notes||"";

  $("editMainGenres").value=
    (entry?.mainGenres||[]).join(", ");
  $("editSecondaryGenres").value=
    (entry?.secondaryGenres||[]).join(", ");

  $("editAiring").value=
    entry?.airingDate||entry?.release||"";
  $("editWatching").value=entry?.watchedDate||"";

  $("mediumField").classList.toggle("hidden",
    type!=="production");
  $("parentField").classList.toggle("hidden",
    type==="group");
  $("episodeNumberField").classList.toggle("hidden",
    type!=="episode");
  $("airingField").classList.toggle("hidden",
    !allowsAiringDate(type,id));
  $("watchingField").classList.toggle("hidden",
    !allowsWatchingDate(type,id));
  $("ratingField").classList.toggle("hidden",
    !canRateManually(type,id));
  $("manualGenresField").classList.toggle("hidden",
    type!=="production");
  $("autoGenresField").classList.toggle("hidden",
    type!=="group"&&type!=="season");
  $("deleteEntryBtn").classList.toggle("hidden",!id);

  const rating=normalizeHalfRating(entry?.rating);
  $("editRating").value=rating===null?"":String(rating);

  fillParentSelector(type,entry?.parentId||parentId);
  updateInheritedGenrePreview();
  renderStarEditor();

  $("bannerPreview").textContent="No banner";
  $("editorOverlay").classList.remove("hidden");

  if(entry){
    const blob=await loadImage(type,id).catch(()=>null);
    if(blob&&state.editType===type&&state.editId===id &&
       !$("editorOverlay").classList.contains("hidden") &&
       state.pendingImage===undefined)
      showPreview(blob);
  }
}

function updateInheritedGenrePreview(){
  const type=state.editType;
  if(type!=="group"&&type!=="season")return;

  const source=type==="group"
    ? findEntry("group",state.editId)
    : findEntry("production",$("editParent").value);

  const genres=effectiveGenres(source);

  $("autoMainGenres").textContent=
    genres.mainGenres.join(" · ")||"No genres yet";
  $("autoSecondaryGenres").textContent=
    genres.secondaryGenres.join(" · ");
}

async function saveEditor(){
  const type=state.editType,id=state.editId;
  if(!type)return;

  const title=$("editTitle").value.trim();
  if(!title)return alert("Enter a title.");

  const parentId=type==="group"?"":$("editParent").value;
  if(["season","episode"].includes(type)&&!parentId)
    return alert("Select a parent.");

  if(parentId&&!findEntry(parentTypeOf(type),parentId))
    return alert("Parent entry not found.");

  const duration=optionalNumber("editDuration");
  const episodeNumber=optionalNumber("editEpisodeNumber");

  if(duration!==null&&
     (!Number.isInteger(duration)||duration<0))
    return alert("Enter a valid duration.");

  if(type==="episode"&&episodeNumber!==null&&
     (!Number.isInteger(episodeNumber)||episodeNumber<1))
    return alert("Enter a valid Episode number.");

  const existing=id?findEntry(type,id):null;
  const allowAiring=allowsAiringDate(type,id);
  const allowWatching=allowsWatchingDate(type,id);

  const airing=$("editAiring").value.trim();
  const watching=$("editWatching").value.trim();

  if(allowAiring&&!validTrackerDate(airing))
    return alert(
      "Airing date not recognized. Try 13.03.26, July 2004 or 2004."
    );

  if(allowWatching&&!validTrackerDate(watching))
    return alert(
      "Watching date not recognized. Try 13.03.26, July 2004 or 2004."
    );

  let rating=existing?.rating??null;

  if(canRateManually(type,id))
    rating=normalizeHalfRating($("editRating").value);
  else if(type==="group"||type==="season")
    rating=null;

  const values={
    title,
    medium:type==="production"?$("editMedium").value:"",
    parentId,
    episodeNumber:type==="episode"?episodeNumber:null,
    release:existing?.release||"",
    airingDate:allowAiring
      ? airing
      : existing?.airingDate||"",
    watchedDate:allowWatching
      ? watching
      : existing?.watchedDate||"",
    duration,rating,
    mainGenres:type==="production"
      ?parseGenres($("editMainGenres").value):[],
    secondaryGenres:type==="production"
      ?parseGenres($("editSecondaryGenres").value):[],
    notes:$("editNotes").value
  };

  const entryId=id||createId();

  try {
    if(state.pendingImage===null){
      await deleteImage(type,entryId);
      invalidateImageURL(type,entryId);
    }else if(state.pendingImage){
      await saveImage(type,entryId,state.pendingImage);
      invalidateImageURL(type,entryId);
    }
  }catch(error){
    console.error(error);
    return alert("Unable to save banner.");
  }

  if(id)updateEntry(type,id,values);
  else createEntry(type,{...values,id:entryId});

  closeEditor();
  renderLibrary();
  renderStatistics();
  await openDetail(type,entryId);
}

function closeEditor(){
  $("editorOverlay").classList.add("hidden");
  state.editType=null;
  state.editId=null;
  state.pendingImage=undefined;
  clearPreview();
}

async function deleteCurrentEntry(){
  const type=state.editType,id=state.editId;
  if(!type||!id)return;

  const warning=type==="group"
    ?"Delete this Group? Its Productions will remain."
    : type==="episode"
      ?"Delete this Episode?"
      :"Delete this entry and all its children?";

  if(!confirm(warning))return;

  const entry=findEntry(type,id);
  const affected=entry?[entry,...descendants(entry)]:[];

  removeEntry(type,id);

  for(const item of affected){
    try{
      await deleteImage(item.type,item.id);
      invalidateImageURL(item.type,item.id);
    }catch(error){console.error(error)}
  }

  closeEditor();
  closeDetail();
  renderLibrary();
  renderStatistics();
}

/* DETAILS */

function setupDetails(){
  $("closeDetail").onclick=closeDetail;
  $("editDetail").onclick=()=>{
    if(state.detailType&&state.detailId)
      openEditor(state.detailType,state.detailId);
  };

  $("detailOverlay").onclick=e=>{
    if(e.target===$("detailOverlay"))closeDetail();
  };
}

function closeDetail(){
  $("detailOverlay").classList.add("hidden");
  state.detailType=null;
  state.detailId=null;
}

async function openDetail(type,id){
  const item=findEntry(type,id);
  if(!item)return;

  state.detailType=type;
  state.detailId=id;

  $("detailOverlay").classList.remove("hidden");
  $("detailKind").textContent=TYPE_NAMES[type];
  $("detailTitle").textContent=item.title;

  const banner=$("detailBanner");
  clear(banner);
  getImageURL(type,id).then(url=>{
    if(!url||state.detailType!==type||state.detailId!==id)
      return;
    const image=new Image();
    image.src=url;
    image.alt="";
    banner.prepend(image);
  }).catch(console.error);

  $("detailMedium").textContent=
    type==="group"?"":effectiveMedium(item);

  const rating=effectiveRating(item);
  makeStars($("detailStars"),rating);

  $("detailRating").textContent=
    rating===null?"Unrated":`(${rating.toFixed(1)})`;

  const extra=[];

  if(effectiveAiringDate(item))
    extra.push("Aired: "+effectiveAiringDate(item));
  if(effectiveWatchingDate(item))
    extra.push("Watched: "+effectiveWatchingDate(item));
  if(type==="episode"){
    if(item.episodeNumber!=null)
      extra.unshift("Episode "+item.episodeNumber);
    if(item.duration!=null)
      extra.push(formatMinutes(Number(item.duration)));
  }

  $("detailExtra").textContent=extra.join(" · ");

  const genres=effectiveGenres(item);
  $("detailMainGenres").textContent=
    genres.mainGenres.join(" · ");
  $("detailSecondaryGenres").textContent=
    genres.secondaryGenres.join(" · ");
  $("detailNotes").textContent=item.notes||"";

  renderDetailChildren(item);
}

function renderDetailChildren(item){
  const area=$("detailChildren");
  clear(area);

  const childType={
    group:"production",
    production:"season",
    season:"episode"
  }[item.type];

  if(!childType)return;

  const header=el("div","children-heading-row");
  header.appendChild(el(
    "div","children-heading",
    childType==="production"?"Productions":
    childType==="season"?"Seasons":"Episodes"
  ));

  const add=el("button","child-add","+ Add");
  add.onclick=()=>openEditor(childType,null,item.id);
  header.appendChild(add);
  area.appendChild(header);

  const children=getChildren(item.type,item.id)
    .slice().sort((a,b)=>childType==="episode"
      ? (a.episodeNumber??Infinity)-
        (b.episodeNumber??Infinity)||a.createdAt-b.createdAt
      : a.createdAt-b.createdAt
    );

  if(!children.length){
    area.appendChild(emptyMessage("No entries yet."));
    return;
  }

  if(item.type==="group"){
    const strip=el("div","production-strip");

    children.forEach(child=>{
      const tile=el("button","production-tile");
      const art=el("div","production-tile-art","✦");
      imageInto(art,child);

      const bottom=el("div","production-tile-bottom");
      bottom.appendChild(el("strong","",child.title));

      const rating=effectiveRating(child);
      bottom.appendChild(el("small","",
        rating===null?"Unrated":"★ "+rating.toFixed(1)));

      tile.append(art,bottom);
      tile.onclick=()=>openDetail(child.type,child.id);
      strip.appendChild(tile);
    });

    area.appendChild(strip);
  }

  if(item.type==="production"){
    const list=el("div","season-list");

    children.forEach(child=>{
      const row=el("button","season-row");
      row.appendChild(el("span","",child.title));
      const rating=effectiveRating(child);
      row.appendChild(el("span","",
        rating===null?"Unrated ›":
        "★ "+rating.toFixed(1)+" ›"));
      row.onclick=()=>openDetail(child.type,child.id);
      list.appendChild(row);
    });

    area.appendChild(list);
  }

  if(item.type==="season"){
    const grid=el("div","episode-grid");

    children.forEach((child,index)=>{
      const tile=el("button","episode-tile");
      imageInto(tile,child);

      tile.appendChild(el("span","episode-number",
        "E"+(child.episodeNumber??index+1)));

      const rating=effectiveRating(child);
      tile.appendChild(el("small","",
        rating===null?"":"★ "+rating.toFixed(1)));

      tile.onclick=()=>openDetail(child.type,child.id);
      grid.appendChild(tile);
    });

    area.appendChild(grid);
  }
}

/* LIBRARY */

function setupLibrary(){
  $("librarySearch").oninput=renderLibrary;
  $("librarySort").onchange=renderLibrary;
  document.querySelectorAll("[data-filter]").forEach(x=>
    x.onchange=renderLibrary
  );
}

function highlightText(item,sort){
  const score=effectiveRating(item);
  const date=effectiveAiringDate(item);
  const medium=effectiveMedium(item);

  switch(sort){
    case "newest":
    case "oldest":
      return "Added: "+
        new Date(item.createdAt||0).toLocaleDateString();

    case "az":
    case "za":
      return "Title: "+item.title;

    case "medium":
      return "Media: "+(medium||"Unspecified");

    case "ratingHigh":
    case "ratingLow":
      return score===null?"Unrated":
        "Rating: ★ "+score.toFixed(2);

    case "releaseNew":
    case "releaseOld":
      return date?"Aired: "+date:"Airing unknown";

    case "lengthTotalHigh":
    case "lengthTotalLow":
      return "Total length: "+formatMinutes(totalLength(item));

    case "episodeCountHigh":
    case "episodeCountLow":
      return "Episodes: "+episodeCount(item);

    default:return "";
  }
}

function renderLibrary(){
  const search=$("librarySearch").value.trim().toLowerCase();
  const sort=$("librarySort").value;

  const types=new Set([...document.querySelectorAll(
    "[data-filter]:checked"
  )].map(x=>x.dataset.filter));

  const entries=allEntries().filter(item=>{
    if(!types.has(item.type))return false;

    const words=[
      contextualTitle(item),
      effectiveMedium(item),
      effectiveAiringDate(item),
      effectiveWatchingDate(item),
      ...genreList(item)
    ].join(" ").toLowerCase();

    return words.includes(search);
  });

  entries.sort((a,b)=>{
    const scoreA=effectiveRating(a);
    const scoreB=effectiveRating(b);
    const releaseA=releaseTimestamp(effectiveAiringDate(a));
    const releaseB=releaseTimestamp(effectiveAiringDate(b));

    let result=0;

    switch(sort){
      case "az":
        result=a.title.localeCompare(b.title);
        break;
      case "za":
        result=b.title.localeCompare(a.title);
        break;
      case "oldest":
        result=(a.createdAt||0)-(b.createdAt||0);
        break;
      case "medium":
        result=effectiveMedium(a).localeCompare(
          effectiveMedium(b));
        break;
      case "ratingHigh":
        result=(scoreB??-1)-(scoreA??-1);
        break;
      case "ratingLow":
        result=(scoreA??Infinity)-(scoreB??Infinity);
        break;
      case "releaseNew":
        result=(releaseB??-Infinity)-
               (releaseA??-Infinity);
        break;
      case "releaseOld":
        result=(releaseA??Infinity)-
               (releaseB??Infinity);
        break;
      case "lengthTotalHigh":
        result=totalLength(b)-totalLength(a);
        break;
      case "lengthTotalLow":
        result=totalLength(a)-totalLength(b);
        break;
      case "episodeCountHigh":
        result=episodeCount(b)-episodeCount(a);
        break;
      case "episodeCountLow":
        result=episodeCount(a)-episodeCount(b);
        break;
      default:
        result=(b.createdAt||0)-(a.createdAt||0);
    }

    return result||contextualTitle(a)
      .localeCompare(contextualTitle(b));
  });

  $("libraryCount").textContent=
    `${entries.length} ${entries.length===1?"entry":"entries"}`;

  const list=$("libraryItems");
  clear(list);

  if(!entries.length){
    list.appendChild(emptyMessage("No entries to display."));
    return;
  }

  entries.forEach(item=>{
    const row=el("button","library-entry");
    const art=el("div","entry-art",SYMBOLS[item.type]);
    imageInto(art,item);

    const info=el("div","entry-info");
    info.appendChild(el("strong","",contextualTitle(item)));
    info.appendChild(el("small","",[
      TYPE_NAMES[item.type],
      effectiveMedium(item)
    ].filter(Boolean).join(" · ")));

    info.appendChild(el("span","entry-highlight",
      highlightText(item,sort)));

    row.append(art,info,el("span","entry-arrow","›"));
    row.onclick=()=>openDetail(item.type,item.id);
    list.appendChild(row);
  });
}

/* WATCHLIST */

function setupWatchlist(){
  $("watchlistForm").onsubmit=e=>{
    e.preventDefault();
    const title=$("watchTitle").value.trim();
    if(!title)return;

    trackerData.watchlist.push({
      id:createId(),
      title,
      medium:$("watchMedium").value,
      release:$("watchRelease").value.trim(),
      createdAt:Date.now()
    });

    saveDatabase();
    $("watchlistForm").reset();
    renderWatchlist();
  };
}

function renderWatchlist(){
  const list=$("watchlistItems");
  clear(list);

  if(!trackerData.watchlist.length){
    list.appendChild(emptyMessage("Your watchlist is empty."));
    return;
  }

  trackerData.watchlist.forEach(item=>{
    const row=el("div","watch-item");
    const checkbox=el("input","watch-check");
    checkbox.type="checkbox";
    checkbox.setAttribute("aria-label",
      "Move "+item.title+" to Library");

    checkbox.onchange=()=>{
      if(!checkbox.checked)return;

      createEntry("production",{
        title:item.title,
        medium:item.medium,
        airingDate:item.release,
        release:item.release
      });

      trackerData.watchlist=trackerData.watchlist.filter(
        x=>x.id!==item.id
      );

      saveDatabase();
      renderWatchlist();
      renderLibrary();
      renderStatistics();
    };

    const info=el("div","watch-text");
    info.appendChild(el("strong","",item.title));
    info.appendChild(el("small","",
      [item.medium,item.release].filter(Boolean).join(" · ")));

    const remove=el("button","watch-delete","×");
    remove.onclick=()=>{
      trackerData.watchlist=trackerData.watchlist.filter(
        x=>x.id!==item.id
      );
      saveDatabase();
      renderWatchlist();
    };

    row.append(checkbox,info,remove);
    list.appendChild(row);
  });
}

/* ACTUAL WATCHING EVENTS */

function watchedEventsForProduction(production){
  const results=[];
  const seasons=getChildren("production",production.id);

  function record(entry){
    const date=parseTrackerDate(effectiveWatchingDate(entry));
    const minutes=directMinutes(entry);

    if(!date||minutes===null||minutes<=0)return;

    results.push({
      productionId:production.id,
      type:entry.type,
      id:entry.id,
      name:contextualTitle(entry),
      medium:production.medium||"Unspecified",
      date,
      minutes
    });
  }

  if(!seasons.length){
    record(production);
  }else{
    seasons.forEach(season=>
      getChildren("season",season.id).forEach(record)
    );
  }

  return results;
}

/* STATISTICS CONFIGURATION */

function setupStatistics(){
  Object.entries(METRICS).forEach(([key,item])=>
    $("statMetric").add(new Option(item.name,key))
  );

  $("statMetric").value="watchTime";

  $("statMetric").onchange=()=>{
    fillDiagramSelector();
    renderStatistics();
  };

  [
    "statDiagram","statGranularity",
    "statMediaMode","statGenreMode","statRatingLevel"
  ].forEach(id=>$(id).onchange=renderStatistics);

  $("statTimeButton").onclick=()=>{
    const panel=$("timeFormatPanel");
    panel.classList.toggle("hidden");
    $("statTimeButton").setAttribute("aria-expanded",
      String(!panel.classList.contains("hidden")));
  };

  $("timeFormat").onchange=renderStatistics;

  $("chartArea").addEventListener("click",chartPointClick);
  $("chartArea").addEventListener("keydown",e=>{
    if((e.key==="Enter"||e.key===" ")&&
       e.target.closest("[data-point]")){
      e.preventDefault();
      chartPointClick(e);
    }
  });

  fillDiagramSelector();
}

function fillDiagramSelector(){
  const metric=$("statMetric").value;
  const select=$("statDiagram");
  const previous=select.value;

  clear(select);

  METRICS[metric].diagrams.forEach(id=>
    select.add(new Option(DIAGRAMS[id],id))
  );

  if(METRICS[metric].diagrams.includes(previous))
    select.value=previous;
}

function formatTimeTotal(minutes,mode){
  const n=Math.round(minutes);
  const hours=Math.floor(n/60);
  const days=Math.floor(n/1440);
  const h=Math.floor(n%1440/60);
  const m=n%60;

  if(mode==="minutes")
    return n.toLocaleString()+" min";

  if(mode==="hours")
    return hours.toLocaleString()+"h "+m+"m";

  if(mode==="days")
    return days+"d "+h+"h "+m+"m";

  if(mode==="months"){
    const months=Math.floor(days/30);
    return months+"mo "+(days%30)+"d "+h+"h "+m+"m";
  }

  if(mode==="year")
    return (n/525600*100).toFixed(2)+"%";

  if(mode==="decade")
    return (n/5256000*100).toFixed(2)+"%";

  return formatMinutes(n);
}

function timeGroup(date,interval){
  if(interval==="year")return String(date.year);

  if(interval==="month")
    return date.month===null?null:
      date.year+"-"+String(date.month).padStart(2,"0");

  if(date.precision!=="day")return null;

  if(interval==="day")return date.key;

  // ISO week: Monday first, week-year may differ
  // from the calendar year.
  const d=new Date(Date.UTC(
    date.year,date.month-1,date.day
  ));
  const day=(d.getUTCDay()+6)%7;
  d.setUTCDate(d.getUTCDate()-day+3);
  const isoYear=d.getUTCFullYear();
  const first=new Date(Date.UTC(isoYear,0,4));
  const firstDay=(first.getUTCDay()+6)%7;
  first.setUTCDate(first.getUTCDate()-firstDay+3);
  const week=1+Math.round((d-first)/604800000);
  return isoYear+"-W"+String(week).padStart(2,"0");
}

function dateGroupLabel(key,interval){
  if(interval==="day"){
    const [y,m,d]=key.split("-");
    return `${d}.${m}.${y}`;
  }
  if(interval==="month"){
    const [y,m]=key.split("-");
    return `${MONTH_NAMES[Number(m)-1].slice(0,3)} ${y}`;
  }
  return key;
}

function statsSnapshot(){
  const productions=trackerData.productions;
  const events=productions.flatMap(watchedEventsForProduction);
  const total=events.reduce((s,e)=>s+e.minutes,0);
  const productionRatings=productions.map(effectiveRating)
    .filter(x=>x!==null);

  return {
    productions,events,total,
    average:productionRatings.length
      ?productionRatings.reduce((a,b)=>a+b,0)/
        productionRatings.length
      :null
  };
}

function namedItemsForLevel(level){
  return getCollection(level).map(item=>({
    item,
    id:item.id,
    type:item.type,
    name:contextualTitle(item),
    value:effectiveRating(item)
  })).filter(x=>x.value!==null);
}

function addGroup(map,key,value,item){
  if(!map.has(key))
    map.set(key,{name:key,value:0,entries:[]});

  const group=map.get(key);
  group.value+=value;
  if(item)group.entries.push(item);
}

function getChartDataset(snapshot){
  const metric=$("statMetric").value;
  const interval=$("statGranularity").value;
  const mediaMode=$("statMediaMode").value;
  const genreMode=$("statGenreMode").value;
  const level=$("statRatingLevel").value;

  const dataset={
    metric,interval,mediaMode,genreMode,level,
    rows:[],points:[],members:new Map(),
    missing:0,unit:"count"
  };

  if(metric==="watchTime"){
    const map=new Map();

    snapshot.events.forEach(event=>{
      const key=timeGroup(event.date,interval);
      if(!key){
        dataset.missing+=event.minutes;
        return;
      }

      addGroup(map,key,event.minutes,{
        type:event.type,id:event.id,
        name:event.name,
        value:event.minutes
      });
    });

    dataset.rows=[...map.values()]
      .sort((a,b)=>a.name.localeCompare(b.name))
      .map(row=>({
        ...row,
        label:dateGroupLabel(row.name,interval)
      }));

    dataset.unit="minutes";
    return dataset;
  }

  if(metric==="media"){
    const map=new Map();

    if(mediaMode==="count"){
      snapshot.productions.forEach(item=>{
        addGroup(map,item.medium||"Unspecified",1,{
          type:item.type,id:item.id,
          name:item.title,value:1
        });
      });
      dataset.unit="productions";
    }else{
      snapshot.events.forEach(event=>{
        addGroup(map,event.medium,event.minutes,{
          type:event.type,id:event.id,
          name:event.name,value:event.minutes
        });
      });
      dataset.unit="minutes";
    }

    dataset.rows=[...map.values()]
      .sort((a,b)=>b.value-a.value);
    return dataset;
  }

  if(metric==="genres"||metric==="overlap"){
    const map=new Map();
    const genreMembers=new Map();

    snapshot.productions.forEach(p=>{
      const genres=genreList(p,genreMode);
      const keys=[...new Set(genres.map(g=>g.toLowerCase()))]
        .sort();

      const nameByKey=new Map(genres.map(g=>[
        g.toLowerCase(),g
      ]));

      keys.forEach(g=>{
        if(!genreMembers.has(g))
          genreMembers.set(g,{
            name:nameByKey.get(g),
            ids:new Set()
          });
        genreMembers.get(g).ids.add(p.id);
      });

      if(metric==="genres"){
        keys.forEach(g=>addGroup(map,
          nameByKey.get(g),1,{
            type:"production",id:p.id,
            name:p.title,value:1
          }));
      }else{
        for(let i=0;i<keys.length;i++)
          for(let j=i+1;j<keys.length;j++){
            const first=nameByKey.get(keys[i]);
            const second=nameByKey.get(keys[j]);
            addGroup(map,first+" + "+second,1,{
              type:"production",id:p.id,
              name:p.title,value:1
            });
          }
      }
    });

    dataset.rows=[...map.values()]
      .sort((a,b)=>b.value-a.value);
    dataset.members=genreMembers;
    dataset.unit="productions";
    return dataset;
  }

  const items=namedItemsForLevel(level);

  if(metric==="ratings"){
    dataset.points=items;
    dataset.rows=items.map(x=>({
      name:x.name,value:x.value,
      entries:[{
        type:x.type,id:x.id,name:x.name,value:x.value
      }]
    }));
    dataset.unit="rating";
    return dataset;
  }

  const sorted=items.sort((a,b)=>
    metric==="highest"
      ?b.value-a.value||a.name.localeCompare(b.name)
      :a.value-b.value||a.name.localeCompare(b.name)
  );

  dataset.rows=sorted.slice(0,10).map(x=>({
    name:x.name,value:x.value,
    entries:[{
      type:x.type,id:x.id,
      name:x.name,value:x.value
    }]
  }));

  dataset.points=dataset.rows;
  dataset.unit="rating";
  return dataset;
}

/* STATISTICS RENDERING */

function renderStatistics(){
  if(!$("statMetric").value)return;

  const snapshot=statsSnapshot();

  $("statProductions").textContent=
    snapshot.productions.length;

  const format=$("timeFormat").value;
  $("statWatchTime").textContent=
    formatTimeTotal(snapshot.total,format);

  $("statTimeUnit").textContent=
    $("timeFormat").selectedOptions[0]?.textContent||"";

  $("statAverage").textContent=
    snapshot.average===null
      ?"—":snapshot.average.toFixed(2);

  const metric=$("statMetric").value;

  $("granularityControl").classList.toggle(
    "hidden",metric!=="watchTime");
  $("mediaModeControl").classList.toggle(
    "hidden",metric!=="media");
  $("genreModeControl").classList.toggle(
    "hidden",metric!=="genres"&&metric!=="overlap");
  $("ratingLevelControl").classList.toggle(
    "hidden",!["ratings","highest","lowest"].includes(metric));

  const dataset=getChartDataset(snapshot);
  const diagram=$("statDiagram").value;

  $("chartTitle").textContent=METRICS[metric].name;
  $("chartSubtitle").textContent=
    DIAGRAMS[diagram]+" · "+
    dataset.unit;

  const description={
    watchTime:
      "Uses actual watching dates, never airing dates. Monthly charts accept exact and month-level dates; yearly charts also accept year-only dates.",
    media:
      "Choose watched minutes or Production counts. Counts include registered Productions even if they have not been watched.",
    genres:
      "Each Production contributes once per selected genre. Main and Secondary modes are counted independently.",
    overlap:
      "Genre combinations are determined from Productions sharing two or more selected genres.",
    ratings:
      "Compare calculated ratings within one hierarchy level. Unrated entries are excluded.",
    highest:
      "The ten highest-rated entries within the chosen hierarchy level.",
    lowest:
      "The ten lowest-rated entries within the chosen hierarchy level."
  };

  $("statExplanation").textContent=description[metric];

  const footnotes=[];

  if(metric==="watchTime"&&dataset.missing>0)
    footnotes.push(
      formatMinutes(dataset.missing)+
      " have dates too imprecise for this interval."
    );

  if(metric==="watchTime")
    footnotes.push(
      "Entries without a watching date or duration are not counted."
    );

  $("chartFootnote").textContent=footnotes.join(" ");

  state.chartRows=dataset.rows;
  state.chartSelected=null;
  state.chartVisible=30;

  $("chartInspector").classList.add("hidden");

  drawCurrentChart(dataset,diagram);
  renderChartDetails(dataset);
}

function drawCurrentChart(dataset,diagram){
  const area=$("chartArea");
  const viewport=$("chartViewport");

  clear(area);
  viewport.scrollLeft=0;

  if(!dataset.rows.length){
    area.appendChild(emptyMessage(
      "No matching data. Add entries or change the selector."
    ));
    return;
  }

  const renderers={
    line:chartLine,
    donut:chartDonut,
    stacked:chartStacked,
    treemap:chartTreemap,
    radar:chartRadar,
    venn:chartVenn,
    upset:chartUpSet,
    chord:chartChord,
    network:chartNetwork,
    histogram:chartHistogram,
    box:chartBox,
    ranked:chartRanked,
    scatter:chartScatter
  };

  const result=renderers[diagram](dataset);

  if(!result){
    area.appendChild(emptyMessage(
      "More data is needed for this diagram."
    ));
    return;
  }

  area.innerHTML=result.svg;

  const width=result.width||400;
  area.style.width=width>500?width+"px":"100%";

  const svg=area.querySelector("svg");
  if(svg){
    svg.style.width="100%";
    svg.setAttribute("aria-label",
      METRICS[dataset.metric].name+" — "+
      DIAGRAMS[diagram]);
  }
}

/* CLICKABLE CHART ELEMENTS */

function pointAttr(index){
  return `data-point="${index}"
    tabindex="0" role="button"`;
}

function chartPointClick(event){
  const target=event.target.closest?.("[data-point]");
  if(!target)return;

  const index=Number(target.dataset.point);
  if(!Number.isInteger(index))return;

  const row=state.chartRows[index];
  if(!row)return;

  state.chartSelected=index;
  const panel=$("chartInspector");

  clear(panel);
  panel.classList.remove("hidden");

  panel.appendChild(el("strong","",
    row.label||row.name));

  panel.appendChild(el("small","",
    "Value: "+Number(row.value).toLocaleString(
      undefined,{maximumFractionDigits:2}
    )));

  const entries=row.entries||[];

  if(entries.length){
    panel.appendChild(el("small","",
      entries.length+" related entries"));
    const list=el("div","chart-detail-list");

    entries.slice(0,20).forEach(entry=>{
      const button=el("button","");
      button.appendChild(el("span","",entry.name));
      button.appendChild(el("small","",
        String(entry.value??"")));
      button.onclick=()=>openDetail(entry.type,entry.id);
      list.appendChild(button);
    });

    if(entries.length>20)
      list.appendChild(el("small","",
        `Showing 20 of ${entries.length} entries`));

    panel.appendChild(list);
  }
}

function renderChartDetails(dataset){
  const area=$("chartDetailList");
  clear(area);

  const rows=dataset.rows;
  const visible=rows.slice(0,state.chartVisible);

  visible.forEach((row,index)=>{
    const button=el("button");
    button.appendChild(el("span","",row.label||row.name));
    button.appendChild(el("small","",
      Number(row.value).toLocaleString(
        undefined,{maximumFractionDigits:2}
      )));

    button.onclick=()=>{
      const inspector=$("chartInspector");
      const fake={
        target:{
          closest:()=>({dataset:{point:String(index)}})
        }
      };
      chartPointClick(fake);
      inspector.scrollIntoView({
        behavior:"smooth",block:"nearest"
      });
    };
    area.appendChild(button);
  });

  if(rows.length>state.chartVisible){
    const more=el("button","show-more",
      `Show more (${rows.length-state.chartVisible} remaining)`);
    more.onclick=()=>{
      state.chartVisible+=30;
      renderChartDetails(dataset);
    };
    area.appendChild(more);
  }
}

/* SVG HELPERS */

function svg(content,w=400,h=300){
  return `<svg viewBox="0 0 ${w} ${h}"
    xmlns="http://www.w3.org/2000/svg"
    role="img" style="font-family:Georgia,serif">
    ${content}
  </svg>`;
}

function text(x,y,t,size=11,anchor="middle",
              color="#ddd0b6"){
  return `<text x="${x}" y="${y}"
    text-anchor="${anchor}" fill="${color}"
    font-size="${size}">${escapeXML(t)}</text>`;
}

function box(x,y,w,h,color,rx=0,attrs=""){
  return `<rect x="${x}" y="${y}"
    width="${Math.max(0,w)}"
    height="${Math.max(0,h)}"
    rx="${rx}" fill="${color}" ${attrs}/>`;
}

function dot(x,y,r,color,attrs=""){
  return `<circle cx="${x}" cy="${y}" r="${r}"
    fill="${color}" ${attrs}/>`;
}

function rule(x1,y1,x2,y2,color="#65543b",width=1){
  return `<line x1="${x1}" y1="${y1}"
    x2="${x2}" y2="${y2}"
    stroke="${color}" stroke-width="${width}"/>`;
}

function polar(cx,cy,r,a){
  const radians=a*Math.PI/180;
  return [
    cx+r*Math.cos(radians),
    cy+r*Math.sin(radians)
  ];
}

function ringSlice(cx,cy,outer,inner,start,end,color,attr){
  const p1=polar(cx,cy,outer,start);
  const p2=polar(cx,cy,outer,end);
  const p3=polar(cx,cy,inner,end);
  const p4=polar(cx,cy,inner,start);
  const large=end-start>180?1:0;

  return `<path d="M${p1} A${outer} ${outer}
    0 ${large} 1 ${p2} L${p3}
    A${inner} ${inner} 0 ${large} 0 ${p4} Z"
    fill="${color}" ${attr}/>`;
}

function totals(rows){
  return rows.reduce((sum,r)=>sum+r.value,0);
}

/* LINE: ALL TIME BUCKETS, SCROLLABLE */

function chartLine(dataset){
  const rows=dataset.rows;
  const width=Math.max(400,80+rows.length*45);
  const height=300;
  const left=45,right=width-28,top=22,bottom=240;
  const max=Math.max(1,...rows.map(r=>r.value));

  let s="";

  for(let i=0;i<=4;i++){
    const y=bottom-i/4*(bottom-top);
    s+=rule(left,y,right,y,"#544a3a",.7);
    s+=text(left-8,y+4,Math.round(i/4*max),
      10,"end");
  }

  const step=(right-left)/Math.max(rows.length-1,1);
  const points=rows.map((r,i)=>[
    left+i*step,
    bottom-r.value/max*(bottom-top)
  ]);

  s+=`<polyline points="${
    points.map(p=>p.join(",")).join(" ")
  }" fill="none" stroke="#e6c67e"
    stroke-width="2"/>`;

  points.forEach((p,i)=>{
    s+=dot(p[0],p[1],5,"#f3dda0",pointAttr(i));
    s+=text(p[0],bottom+20,
      rows[i].label||rows[i].name,9);
  });

  return {svg:svg(s,width,height),width};
}

/* DONUT: TOP CATEGORIES PLUS OTHER */

function chartDonut(dataset){
  const rows=[...dataset.rows].sort((a,b)=>b.value-a.value);
  const top=rows.slice(0,7);
  const remainder=rows.slice(7);

  const combined=[...top];
  if(remainder.length)combined.push({
    name:"Other",
    value:totals(remainder),
    entries:remainder.flatMap(r=>r.entries||[])
  });

  const total=totals(combined);
  if(!total)return null;

  let start=-90,s="";

  combined.forEach((r,i)=>{
    const angle=r.value/total*360;
    const attrs=i<top.length
      ?pointAttr(dataset.rows.indexOf(r)):"";

    if(angle>=359.999){
      s+=`<circle cx="140" cy="145" r="87"
        fill="none" stroke="${GOLD_COLORS[i%8]}"
        stroke-width="39" ${attrs}/>`;
    }else{
      s+=ringSlice(140,145,105,66,
        start,start+angle,GOLD_COLORS[i%8],attrs);
    }
    start+=angle;
  });

  s+=text(140,139,total.toLocaleString(),20);
  s+=text(140,159,dataset.unit,10);

  combined.forEach((r,i)=>{
    const y=50+i*27;
    s+=dot(282,y,5,GOLD_COLORS[i%8]);
    s+=text(295,y+4,r.name.slice(0,20),10,"start");
  });

  return {svg:svg(s,470,300)};
}

/* STACKED BAR */

function chartStacked(dataset){
  let rows=dataset.rows;

  if(dataset.metric==="ratings"){
    const bins=new Map();

    for(let i=0;i<=20;i++)
      bins.set(i/2,{name:(i/2).toFixed(1),
        value:0,entries:[]});

    dataset.points.forEach(item=>{
      const key=Math.round(item.value*2)/2;
      const bin=bins.get(key);
      if(bin){
        bin.value++;
        bin.entries.push({
          type:item.type,id:item.id,
          name:item.name,value:item.value
        });
      }
    });

    rows=[...bins.values()];
  }

  const total=totals(rows);
  if(!total)return null;

  let s="",cursor=20;

  rows.forEach((r,i)=>{
    const width=r.value/total*360;
    const index=dataset.rows.indexOf(r);
    s+=box(cursor,98,width,62,GOLD_COLORS[i%8],
      0,index>=0?pointAttr(index):"");
    cursor+=width;
  });

  s+=text(200,80,"TOTAL: "+total.toLocaleString(),14);

  const legendRows=rows.filter(r=>r.value>0);
  const view=legendRows.slice(0,12);
  view.forEach((r,i)=>{
    const column=i%2,row=Math.floor(i/2);
    const x=16+column*190,y=190+row*19;
    s+=dot(x,y,4,GOLD_COLORS[i%8]);
    s+=text(x+11,y+4,r.name.slice(0,18),
      10,"start");
  });

  return {svg:svg(s,400,320)};
}

/* TREEMAP */

function chartTreemap(dataset){
  const rows=[...dataset.rows].sort((a,b)=>b.value-a.value);
  const selected=rows.slice(0,20);

  if(rows.length>20){
    selected.push({
      name:"Other",
      value:totals(rows.slice(20)),
      entries:rows.slice(20).flatMap(r=>r.entries||[])
    });
  }

  const total=totals(selected);
  if(!total)return null;

  let regions=[{x:10,y:12,w:380,h:270}];
  let remaining=total;
  let s="";

  selected.forEach((r,i)=>{
    const current=regions[0];
    const ratio=i===selected.length-1
      ?1:r.value/remaining;

    let slice,rest;

    if(current.w>=current.h){
      const w=current.w*ratio;
      slice={x:current.x,y:current.y,w,h:current.h};
      rest={x:current.x+w,y:current.y,
        w:current.w-w,h:current.h};
    }else{
      const h=current.h*ratio;
      slice={x:current.x,y:current.y,w:current.w,h};
      rest={x:current.x,y:current.y+h,
        w:current.w,h:current.h-h};
    }

    regions=[rest];
    remaining-=r.value;

    const index=dataset.rows.indexOf(r);

    s+=box(slice.x+1,slice.y+1,
      slice.w-2,slice.h-2,GOLD_COLORS[i%8],3,
      index>=0?pointAttr(index):"");

    if(slice.w>55&&slice.h>28)
      s+=text(slice.x+slice.w/2,
        slice.y+slice.h/2,
        r.name.slice(0,Math.floor(slice.w/8)),
        10,"middle","#15110b");
  });

  return {svg:svg(s)};
}

/* RADAR */

function chartRadar(dataset){
  const rows=dataset.rows.slice(0,10);
  if(rows.length<3)return null;

  const n=rows.length,cx=200,cy=150,r=95;
  const max=Math.max(1,...rows.map(x=>x.value));
  let s="";

  for(let level=1;level<=4;level++){
    const points=rows.map((v,i)=>
      polar(cx,cy,r*level/4,
        -90+i*360/n).join(",")
    ).join(" ");

    s+=`<polygon points="${points}" fill="none"
      stroke="#66583f" stroke-width=".8"/>`;
  }

  const points=rows.map((v,i)=>
    polar(cx,cy,r*v.value/max,
      -90+i*360/n).join(",")
  ).join(" ");

  s+=`<polygon points="${points}"
    fill="#d9b66c" fill-opacity=".28"
    stroke="#f0d99b" stroke-width="2"/>`;

  rows.forEach((v,i)=>{
    const p=polar(cx,cy,r+25,-90+i*360/n);
    s+=text(p[0],p[1],v.name.slice(0,13),10);
    const q=polar(cx,cy,r*v.value/max,-90+i*360/n);
    s+=dot(q[0],q[1],5,GOLD_COLORS[i%8],
      pointAttr(dataset.rows.indexOf(v)));
  });

  return {svg:svg(s)};
}

/* VENN: SET MEMBERSHIPS, 2 OR 3 GENRES */

function chartVenn(dataset){
  const names=[...dataset.members.entries()]
    .sort((a,b)=>b[1].ids.size-a[1].ids.size)
    .slice(0,3);

  if(names.length<2)return null;

  const positions=names.length===2
    ?[[158,150],[242,150]]
    :[[158,120],[242,120],[200,185]];

  let s="";

  names.forEach(([name,info],i)=>{
    const [x,y]=positions[i];
    s+=`<circle cx="${x}" cy="${y}" r="73"
      fill="${GOLD_COLORS[i]}"
      fill-opacity=".22"
      stroke="${GOLD_COLORS[i]}" stroke-width="2"/>`;
    s+=text(x,y-10,info.name.slice(0,15),12);
    s+=text(x,y+9,info.ids.size,11);
  });

  return {svg:svg(s)};
}

/* UPSET: EXACT MEMBERSHIP PATTERNS */

function chartUpSet(dataset){
  const selected=[...dataset.members.entries()]
    .sort((a,b)=>b[1].ids.size-a[1].ids.size)
    .slice(0,5);

  if(selected.length<2)return null;

  const patterns=new Map();
  const productions=trackerData.productions;

  productions.forEach(p=>{
    const present=selected.map(([key,info])=>
      info.ids.has(p.id));

    if(!present.some(Boolean))return;

    const key=present.map(x=>x?"1":"0").join("");
    if(!patterns.has(key))
      patterns.set(key,{pattern:present,ids:[]});

    patterns.get(key).ids.push(p.id);
  });

  const rows=[...patterns.values()]
    .sort((a,b)=>b.ids.length-a.ids.length)
    .slice(0,15);

  if(!rows.length)return null;

  const width=Math.max(400,100+rows.length*33);
  const max=Math.max(...rows.map(r=>r.ids.length));
  let s="";

  rows.forEach((r,i)=>{
    const x=95+i*33;
    const h=r.ids.length/max*100;
    s+=box(x,125-h,22,h,GOLD_COLORS[i%8],2);
    s+=text(x+11,116-h,r.ids.length,9);

    const active=[];
    r.pattern.forEach((yes,j)=>{
      const y=172+j*24;
      s+=dot(x+11,y,4,yes?"#f0d99b":"#4a443d");
      if(yes)active.push(y);
    });

    if(active.length>1)
      s+=rule(x+11,Math.min(...active),
        x+11,Math.max(...active),"#f0d99b",2);
  });

  selected.forEach(([key,info],j)=>
    s+=text(84,176+j*24,
      info.name.slice(0,11),10,"end")
  );

  return {svg:svg(s,width,330),width};
}

/* CHORD */

function chartChord(dataset){
  const names=[...dataset.members.entries()]
    .sort((a,b)=>b[1].ids.size-a[1].ids.size)
    .slice(0,9);

  if(names.length<2)return null;

  const cx=200,cy=150,r=101;
  const positions=names.map((_,i)=>
    polar(cx,cy,r,-90+i*360/names.length)
  );

  let s=`<circle cx="${cx}" cy="${cy}" r="${r}"
    fill="none" stroke="#756344"/>`;

  for(let i=0;i<names.length;i++){
    for(let j=i+1;j<names.length;j++){
      const first=names[i][1].ids;
      const second=names[j][1].ids;
      let shared=0;
      for(const id of first)if(second.has(id))shared++;
      if(!shared)continue;

      const p=positions[i],q=positions[j];
      s+=`<path d="M${p} Q${cx} ${cy} ${q}"
        fill="none" stroke="${GOLD_COLORS[i%8]}"
        stroke-opacity=".55"
        stroke-width="${Math.min(9,1+shared)}"/>`;
    }
  }

  positions.forEach((p,i)=>{
    s+=dot(p[0],p[1],6,GOLD_COLORS[i%8]);
    const label=polar(cx,cy,r+25,
      -90+i*360/names.length);
    s+=text(label[0],label[1],
      names[i][1].name.slice(0,11),10);
  });

  return {svg:svg(s)};
}

/* NETWORK */

function chartNetwork(dataset){
  const names=[...dataset.members.entries()]
    .sort((a,b)=>b[1].ids.size-a[1].ids.size)
    .slice(0,12);

  if(names.length<2)return null;

  const cx=200,cy=150,r=103;
  const points=names.map((_,i)=>
    polar(cx,cy,r,-90+i*360/names.length)
  );

  let s="";

  for(let i=0;i<names.length;i++)
    for(let j=i+1;j<names.length;j++){
      let shared=0;
      for(const id of names[i][1].ids)
        if(names[j][1].ids.has(id))shared++;

      if(shared)
        s+=rule(...points[i],...points[j],
          "#987849",Math.min(7,1+shared));
    }

  points.forEach((p,i)=>{
    s+=dot(p[0],p[1],8,GOLD_COLORS[i%8]);
    const label=polar(cx,cy,r+29,
      -90+i*360/names.length);
    s+=text(label[0],label[1],
      names[i][1].name.slice(0,10),9);
  });

  return {svg:svg(s)};
}

/* HISTOGRAM */

function chartHistogram(dataset){
  const bins=Array.from({length:21},(_,i)=>({
    name:(i/2).toFixed(1),value:0,entries:[]
  }));

  dataset.points.forEach(item=>{
    const index=Math.max(0,Math.min(20,
      Math.round(item.value*2)));
    bins[index].value++;
    bins[index].entries.push({
      type:item.type,id:item.id,
      name:item.name,value:item.value
    });
  });

  const max=Math.max(1,...bins.map(b=>b.value));
  let s="";

  bins.forEach((bin,i)=>{
    const x=25+i*17,h=bin.value/max*193;
    s+=box(x,240-h,14,h,GOLD_COLORS[i%8],2);
    if(i%2===0)
      s+=text(x+7,256,bin.name,9);
  });

  s+=rule(20,240,389,240);
  return {svg:svg(s)};
}

/* BOX AND WHISKER */

function chartBox(dataset){
  const values=dataset.points.map(x=>x.value)
    .sort((a,b)=>a-b);

  if(!values.length)return null;

  const q=t=>{
    const p=(values.length-1)*t;
    const lo=Math.floor(p),hi=Math.ceil(p);
    return values[lo]+(values[hi]-values[lo])*(p-lo);
  };

  const min=values[0],max=values.at(-1);
  const q1=q(.25),med=q(.5),q3=q(.75);
  const x=value=>35+value/10*330;

  let s=rule(x(min),150,x(max),150,"#e6cb8b",2);
  s+=rule(x(min),132,x(min),168,"#e6cb8b",2);
  s+=rule(x(max),132,x(max),168,"#e6cb8b",2);
  s+=box(x(q1),111,x(q3)-x(q1),77,"#ba9253",3);
  s+=rule(x(med),111,x(med),188,"#fff0b4",3);

  for(let i=0;i<=10;i+=2)
    s+=text(x(i),216,i,11);

  s+=text(200,61,
    "Median "+med.toFixed(2)+" / 10",16);

  return {svg:svg(s)};
}

/* RANKED HORIZONTAL BAR */

function chartRanked(dataset){
  let rows=dataset.rows;

  if(dataset.metric==="watchTime"){
    const groups=new Map();

    trackerData.productions.forEach(p=>{
      const minutes=watchedEventsForProduction(p)
        .reduce((n,e)=>n+e.minutes,0);

      if(minutes>0)
        groups.set(p.id,{
          name:p.title,value:minutes,
          entries:[{
            type:"production",id:p.id,
            name:p.title,value:minutes
          }]
        });
    });

    rows=[...groups.values()]
      .sort((a,b)=>b.value-a.value);
  }else{
    rows=[...rows].sort((a,b)=>
      dataset.metric==="lowest"
        ?a.value-b.value:b.value-a.value
    );
  }

  if(!rows.length)return null;

  const width=650;
  const height=Math.max(160,rows.length*31+25);
  const max=Math.max(1,...rows.map(x=>x.value));

  let s="";

  rows.forEach((r,i)=>{
    const y=10+i*31;
    const label=r.name.length>39
      ?r.name.slice(0,38)+"…":r.name;
    const bar=r.value/max*245;

    s+=text(8,y+15,label,11,"start");
    s+=box(325,y,245,18,"#27231f",3);
    s+=box(325,y,bar,18,GOLD_COLORS[i%8],3,
      dataset.rows.includes(r)
        ?pointAttr(dataset.rows.indexOf(r)):"");
    s+=text(580,y+14,r.value.toFixed(2),10,"start");
  });

  return {svg:svg(s,width,height),width};
}

/* SCATTER — RATINGS VS REGISTERED LENGTH */

function chartScatter(dataset){
  const points=dataset.points.map(row=>{
    const item=findEntry(row.type,row.id);
    return {
      ...row,
      x:totalLength(item),
      y:row.value
    };
  });

  if(!points.length)return null;

  const left=45,right=375,top=20,bottom=245;
  const maxX=Math.max(1,...points.map(x=>x.x));

  let s=rule(left,bottom,right,bottom);
  s+=rule(left,top,left,bottom);

  for(let i=0;i<=5;i++){
    const y=bottom-i/5*(bottom-top);
    s+=rule(left,y,right,y,"#50483a",.7);
    s+=text(36,y+4,String(i*2),10,"end");
  }

  points.forEach((p,i)=>{
    const x=left+p.x/maxX*(right-left);
    const y=bottom-p.y/10*(bottom-top);

    s+=dot(x,y,5,GOLD_COLORS[i%8],pointAttr(i));
  });

  s+=text(210,283,"Registered duration (minutes)",11);
  return {svg:svg(s)};
}

/* KEYBOARD */

document.addEventListener("keydown",e=>{
  if(e.key!=="Escape")return;

  if(!$("editorOverlay").classList.contains("hidden")){
    closeEditor();
    return;
  }

  if(!$("detailOverlay").classList.contains("hidden")){
    closeDetail();
    return;
  }

  if(state.currentPage!=="home")goHome();
});
