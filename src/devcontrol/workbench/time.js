  // Display-only policy: SQLite and API timestamps remain UTC. Never shift
  // the stored instant, task lease deadline, gate evidence or audit ordering.
  const beijingTimeZone='Asia/Shanghai';
  const beijingDateFormatter=new Intl.DateTimeFormat('zh-CN',{
    timeZone:beijingTimeZone,year:'numeric',month:'2-digit',day:'2-digit',
  });
  const beijingTimeFormatter=new Intl.DateTimeFormat('zh-CN',{
    timeZone:beijingTimeZone,hour:'2-digit',minute:'2-digit',second:'2-digit',
    hourCycle:'h23',
  });
  function utcInstant(value){
    if(value instanceof Date)return Number.isFinite(value.getTime())?value:null;
    if(typeof value==='number'){
      const date=new Date(value);
      return Number.isFinite(date.getTime())?date:null;
    }
    if(typeof value!=='string'||!value.trim())return null;
    const text=value.trim();
    // SQLite's CURRENT_TIMESTAMP has no suffix but represents UTC, not the
    // browser's own time zone. A date-only business value is not an instant.
    if(/^\d{4}-\d{2}-\d{2}$/.test(text))return null;
    const normalized=/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?$/.test(text)
      ?text.replace(' ','T')+'Z':text;
    const date=new Date(normalized);
    return Number.isFinite(date.getTime())?date:null;
  }
  function beijingDateTime(value){
    const date=utcInstant(value);
    return date
      ?beijingDateFormatter.format(date)+' '+beijingTimeFormatter.format(date)+' 北京时间'
      :String(value||'—');
  }
  function beijingDate(value){
    const date=utcInstant(value);
    return date?beijingDateFormatter.format(date)+'（北京时间）':String(value||'—');
  }
  function beijingClock(value=new Date()){
    const date=utcInstant(value);
    return date?beijingTimeFormatter.format(date)+' 北京时间':'—';
  }
