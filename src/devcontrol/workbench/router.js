/** Native Hash navigation: back/forward/direct links, no document reload. */
export function createHashRouter(views, onChange) {
  const allowed=new Set(views);
  const resolve=()=>{
    let hash;
    try{hash=decodeURIComponent(window.location.hash.slice(1));}
    catch{return 'overview';}
    return allowed.has(hash)?hash:'overview';
  };
  const sync=()=>onChange(resolve());
  window.addEventListener('hashchange',sync);
  return {
    sync,
    current:resolve,
    go(view){
      if(!allowed.has(view))return;
      if(resolve()!==view)window.location.hash=view;
      sync();
    },
  };
}
