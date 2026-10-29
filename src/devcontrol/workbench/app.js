import { createHashRouter } from './router.js';
(()=>{
  "use strict";
  const $=id=>document.getElementById(id);
  const locale="__LOCALE__";
  const languagePack=__TRANSLATIONS__;
  const translate=(value)=>locale==="en" ? (languagePack[value]||value) : value;
  function localizeChrome(){
    if(locale!=="en")return;
    const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
    const candidates=[];let node;
    while((node=walker.nextNode())){
      const parent=node.parentElement;
      if(parent&&["SCRIPT","STYLE","PRE","CODE"].includes(parent.tagName))continue;
      if(languagePack[node.nodeValue?.trim()||""])candidates.push(node);
    }
    for(const item of candidates){
      const value=item.nodeValue||"",key=value.trim();
      item.nodeValue=value.replace(key,languagePack[key]);
    }
    for(const item of document.querySelectorAll("[placeholder]")){
      const current=item.getAttribute("placeholder");
      if(current&&languagePack[current])item.setAttribute("placeholder",languagePack[current]);
    }
    document.title="DevControl · Project workspace";
  }
