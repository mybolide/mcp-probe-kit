export const V5_APP_STYLES = `
:root { color-scheme:light dark; --panel:var(--color-background-primary,#fff);--bg:var(--color-background-secondary,#f5f7fb);--text:var(--color-text-primary,#152033);--muted:var(--color-text-secondary,#61708a);--border:var(--color-border-primary,#d9e1ec);--blue:#2563eb;font-family:ui-sans-serif,system-ui,-apple-system,"PingFang SC",sans-serif }
*{box-sizing:border-box}html,body{margin:0;max-width:100%;overflow-x:hidden;background:var(--bg);color:var(--text)}
body{container-type:inline-size;font-size:13px;line-height:1.55}
#app{max-width:1080px;margin:0 auto;padding:18px;min-height:260px}
.top{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:17px}
.eyebrow{font-size:10px;font-weight:750;letter-spacing:.14em;color:var(--blue)}
h1{font-size:23px;letter-spacing:-.045em;line-height:1.25;margin:6px 0 5px}
h1 span{color:var(--blue)}
.top p,.item p{margin:0;color:var(--muted)}
.tag,.status{font-size:11px;padding:3px 8px;border-radius:50px;background:color-mix(in srgb,var(--blue) 9%,var(--panel));color:var(--blue);white-space:nowrap}
.project-form,.item,.empty{background:var(--panel);border:1px solid var(--border);border-radius:12px}
.project-form{padding:14px 16px}
label{display:block;color:var(--muted);font-size:11px;font-weight:650;margin-bottom:8px}
.project-row{display:flex;gap:8px}
input{width:100%;min-width:0;flex:1;border:1px solid var(--border);background:var(--panel);color:var(--text);border-radius:7px;padding:9px 11px;font:inherit;outline-offset:2px}
input:focus{outline:2px solid var(--blue);border-color:var(--blue)}
button{border:1px solid var(--border);border-radius:8px;padding:8px 12px;background:var(--panel);color:var(--text);font:inherit;cursor:pointer}
button:hover{border-color:var(--blue)}
button:focus-visible{outline:2px solid var(--blue);outline-offset:3px}
button:disabled{opacity:.5;cursor:default}
.project-row button{background:var(--blue);border-color:var(--blue);color:#fff;font-weight:650;white-space:nowrap}
.tabs{display:flex;gap:6px;overflow-x:auto;margin:16px 0 8px}
.tabs button{font-size:12px;white-space:nowrap}
.tabs .active{background:var(--blue);border-color:var(--blue);color:white}
.notice{border:1px solid var(--border);border-radius:8px;padding:9px 12px;margin:10px 0;color:var(--muted);background:var(--panel)}
.list-head{display:flex;align-items:center;gap:10px;margin:16px 0 10px}
.list-head strong{font-size:15px}.list-head span{color:var(--muted);font-size:11px;flex:1}
.refresh{font-size:11px}
.cards{display:grid;gap:9px}
.item{padding:13px 15px;overflow-wrap:anywhere}
.item-top{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}
.item strong{font-size:13px}.item p{font-size:12px;margin:7px 0}
.item small{font-size:10px;color:var(--muted)}
.empty{padding:32px 18px;text-align:center;color:var(--muted)}
footer{font-size:11px;color:var(--muted);margin:18px 2px 4px}
@container (max-width:480px){#app{padding:12px}.project-row{flex-direction:column}h1{font-size:20px}.project-row button{width:100%}.item-top{flex-wrap:wrap}}
`;
