  function strip(s){return s.replace(/\[([^\]]+)\]\([^)]+\)/g,"$1").replace(/[*_]/g,"").replace(new RegExp(String.fromCharCode(96),"g"),"").trim();}
  // GFM-style pipe cells; a pipe escaped with a backslash or inside an inline
  // code span belongs to the cell, rather than creating a new column.
  function tableCells(line){
    let raw=line.trim();
    if(!raw.includes("|"))return null;
    if(raw.startsWith("|"))raw=raw.slice(1);
    if(raw.endsWith("|")&&!raw.endsWith(String.fromCharCode(92)+"|"))raw=raw.slice(0,-1);
    const cells=[];let cell="",ticks=0;
    const tick=String.fromCharCode(96),slash=String.fromCharCode(92);
    for(let i=0;i<raw.length;i++){
      const ch=raw[i];
      if(ch===slash&&raw[i+1]==="|"){cell+="|";i++;continue;}
      if(ch===tick){
        let count=1;while(raw[i+count]===tick)count++;
        ticks=ticks===0?count:ticks===count?0:ticks;
        cell+=tick.repeat(count);i+=count-1;continue;
      }
      if(ch==="|"&&ticks===0){cells.push(cell.trim());cell="";continue;}
      cell+=ch;
    }
    cells.push(cell.trim());return cells;
  }
  function tableDivider(cells,count){
    return cells&&cells.length===count&&
      cells.every(cell=>/^:?-{3,}:?$/.test(cell));
  }
  function appendTable(out,header,divider,rows){
    const scroll=n("div",null,"md-table-scroll");
    const table=n("table",null,"md-table"),head=n("thead"),body=n("tbody");
    const align=divider.map(cell=>cell.startsWith(":")&&cell.endsWith(":")?"center":
      cell.endsWith(":")?"right":"left");
    const headerRow=n("tr");
    header.forEach((cell,j)=>{const th=n("th",strip(cell));th.scope="col";th.style.textAlign=align[j];headerRow.append(th);});
    head.append(headerRow);
    rows.forEach(cells=>{
      const row=n("tr");
      header.forEach((_,j)=>{const td=n("td",strip(cells[j]||""));td.style.textAlign=align[j];row.append(td);});
      body.append(row);
    });
    table.append(head,body);scroll.append(table);out.append(scroll);
  }
  function markdown(container,source){
    const lines=source.split(/\r?\n/);const out=document.createDocumentFragment();
    let fenced=false,pre=[],list=null;
    const flushList=()=>{if(list){out.append(list);list=null;}};
    const flushPre=()=>{if(pre.length){out.append(n("pre",pre.join("\n")));pre=[];}};
    for(let i=0;i<lines.length;i++){
      const line=lines[i];
      if(line.trim().startsWith(String.fromCharCode(96).repeat(3))){flushList();if(fenced)flushPre();fenced=!fenced;continue;}
      if(fenced){pre.push(line);continue;}
      const header=tableCells(line),divider=tableCells(lines[i+1]||"");
      if(header&&tableDivider(divider,header.length)){
        flushList();const rows=[];
        while(i+2<lines.length){
          const cells=tableCells(lines[i+2]);
          if(!cells)break;
          rows.push(cells);i++;
        }
        appendTable(out,header,divider,rows);i++;continue;
      }
      const h=/^(#{1,4})\s+(.+)/.exec(line);
      if(h){flushList();out.append(n("h"+Math.min(3,h[1].length),strip(h[2])));continue;}
      const bullet=/^\s*[-*+]\s+(.+)/.exec(line);
      if(bullet){if(!list)list=n("ul");list.append(n("li",strip(bullet[1])));continue;}
      flushList();
      if(!line.trim())continue;
      if(/^>/.test(line)){out.append(n("blockquote",strip(line.replace(/^>\s*/,""))));continue;}
      out.append(n("p",strip(line)));
    }
    flushList();flushPre();container.replaceChildren(out);
  }
  async function openDoc(source){
    $("overlay").classList.add("open");
    $("doc-title").textContent="读取文档…";$("doc-source").textContent=source;
    $("doc-content").replaceChildren(n("p","读取规范性源文档中…"));
    try{
      const data=await fetchJSON("/api/docs?path="+encodeURIComponent(source));
      $("doc-title").textContent=data.title;$("doc-source").textContent=data.path+"  ·  最后修改 "+new Date(data.modifiedAt).toLocaleDateString();
      markdown($("doc-content"),data.markdown);
    }catch(e){$("doc-content").replaceChildren(n("p","文档无法打开："+e.message,"error"));}
  }
