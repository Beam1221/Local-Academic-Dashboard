'use strict';
const {app, BrowserWindow, Menu, Tray, dialog, shell, nativeImage, session} = require('electron');
const {spawn} = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

// Test data overrides are opt-in and never included in the distribution.
const smoke = process.argv.includes('--smoke-test');
const backendSmoke = smoke && process.argv.includes('--backend-only');
app.setPath('userData', path.join(app.getPath('appData'), 'Studyspace'));
if (smoke && process.env.STUDYSPACE_TEST_DATA) app.setPath('userData', path.resolve(process.env.STUDYSPACE_TEST_DATA));
app.setName('Studyspace');
const home = app.getPath('userData');
fs.mkdirSync(home, {recursive:true});
const preferencePath = path.join(home, 'desktop.json');
let prefs = {};
try {prefs = JSON.parse(fs.readFileSync(preferencePath, 'utf8'));} catch {}
let backend, window, tray, origin, quitting = false, stopping = false, failed = false;
const token = crypto.randomBytes(32).toString('hex');
const data = path.join(home, 'data');
const logPath = path.join(home, 'desktop.log');
if (fs.existsSync(logPath) && fs.statSync(logPath).size > 2e6) fs.renameSync(logPath, logPath+'.previous');
function log(message) {fs.appendFileSync(logPath, new Date().toISOString()+' '+message+'\n');}
function savePrefs() {fs.writeFileSync(preferencePath, JSON.stringify(prefs,null,2));}
function show() {if(window){window.show();if(window.isMinimized())window.restore();window.focus();}}
function external(url) {try {if(['https:','http:'].includes(new URL(url).protocol)) void shell.openExternal(url);}catch{}}

if (!app.requestSingleInstanceLock()) app.quit();
else {
 app.on('second-instance',show);
 app.whenReady().then(start).catch(error=>{failed=true;log('Startup error: '+error.message);if(!smoke)dialog.showErrorBox('Studyspace could not start',error.message+'\n\nDetails: '+logPath);app.quit();});
}
app.on('window-all-closed',()=>{/* Keep the scheduler and music in the tray. */});
app.on('activate',show);
app.on('before-quit',event=>{
 quitting=true;
 if(backend && backend.exitCode===null && !stopping){
   event.preventDefault();stopping=true;
   backend.stdin.end();
   const timer=setTimeout(()=>{backend.kill();app.exit(smoke?1:0);},8000);
   backend.once('exit',()=>{clearTimeout(timer);backend=undefined;if(failed)app.exit(1);else app.quit();});
 }
});

async function api(route, options={}) {
 const response = await fetch(origin+route,{...options,headers:{'x-studyspace-token':token,'Content-Type':'application/json',...options.headers},signal:AbortSignal.timeout(3000)});
 if(!response.ok)throw new Error(route+' returned '+response.status);
 return response;
}

async function start() {
 app.setAppUserModelId('local.studyspace.desktop');
 fs.mkdirSync(data,{recursive:true});
 const resources=app.isPackaged?process.resourcesPath:__dirname;
 const exe=app.isPackaged?path.join(resources,'backend','studyspace-backend.exe'):path.join(__dirname,'backend-dist','studyspace-backend','studyspace-backend.exe');
 const web=app.isPackaged?path.join(resources,'web'):path.resolve(__dirname,'../frontend/dist');
 backend=spawn(exe,[],{windowsHide:true,cwd:path.dirname(exe),env:{...process.env,DATA_DIR:data,STUDYSPACE_WEB_DIR:web,STUDYSPACE_DESKTOP_TOKEN:token,STUDYSPACE_PORT:String(prefs.port||0)},stdio:['pipe','pipe','pipe']});
 backend.stderr.on('data',chunk=>log(chunk.toString().trim()));
 const port=await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(new Error('The backend took too long to start.')),45000);
   let output='';
   backend.once('error',error=>{clearTimeout(timer);reject(error);});
   backend.once('exit',code=>{clearTimeout(timer);reject(new Error('Backend exited during startup ('+code+').'));});
   backend.stdout.on('data',chunk=>{output+=chunk.toString();const end=output.indexOf('\n');if(end>=0){try{const value=JSON.parse(output.slice(0,end));if(Number.isInteger(value.port)){clearTimeout(timer);resolve(value.port);}}catch{} output=output.slice(end+1);}});
 });
 prefs.port=port;savePrefs();origin='http://127.0.0.1:'+port;
 let healthy=false;
 for(let i=0;i<150;i++){try{await api('/api/desktop-health');healthy=true;break;}catch{await new Promise(r=>setTimeout(r,200));}}
 if(!healthy)throw new Error('The backend did not become ready.');
 backend.on('exit',code=>{if(!quitting){log('Backend stopped unexpectedly: '+code);if(!smoke)dialog.showErrorBox('Studyspace stopped','The background service stopped. Please quit and reopen Studyspace. Your saved data is retained.');app.quit();}});
 if(backendSmoke){await verifySmoke(false);app.quit();return;}
 const ses=session.defaultSession;
 ses.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false));
 ses.setPermissionCheckHandler(()=>false);
 ses.webRequest.onBeforeSendHeaders({urls:[origin+'/*']},(details,callback)=>{callback({requestHeaders:{...details.requestHeaders,'X-Studyspace-Token':token}});});
 window=new BrowserWindow({width:1320,height:900,minWidth:740,minHeight:580,show:false,title:'Studyspace',backgroundColor:'#101216',icon:path.join(__dirname,'icon.png'),webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,backgroundThrottling:false}});
 window.webContents.setWindowOpenHandler(({url})=>{external(url);return {action:'deny'};});
 window.webContents.on('will-navigate',(event,url)=>{if(new URL(url).origin!==origin){event.preventDefault();external(url);}});
 window.webContents.on('will-attach-webview',event=>event.preventDefault());
 window.webContents.on('render-process-gone',(_event,details)=>log('Renderer exited: '+JSON.stringify(details)));
 window.on('close',event=>{if(!quitting){event.preventDefault();window.hide();if(!prefs.explainedTray){prefs.explainedTray=true;savePrefs();tray.displayBalloon({title:'Studyspace is still running',content:'Reminders and music continue in the tray. Right-click the Studyspace icon to quit.'});}}});
 tray=new Tray(nativeImage.createFromPath(path.join(__dirname,'icon.png')).resize({width:24,height:24}));
 tray.setToolTip('Studyspace — double-click to open');tray.on('double-click',show);
 const launchSetting=()=>({label:'Start with Windows',type:'checkbox',checked:app.getLoginItemSettings().openAtLogin,click:item=>{app.setLoginItemSettings({openAtLogin:item.checked,path:process.execPath});}});
 const menu=[{label:'Open Studyspace',click:show},{label:'Open data folder',click:()=>void shell.openPath(data)},launchSetting(),{type:'separator'},{label:'Quit Studyspace',click:()=>app.quit()}];
 tray.setContextMenu(Menu.buildFromTemplate(menu));
 Menu.setApplicationMenu(Menu.buildFromTemplate([{label:'Studyspace',submenu:[{label:'Open data folder',click:()=>void shell.openPath(data)},launchSetting(),{type:'separator'},{label:'Quit',click:()=>app.quit()}]},{label:'Edit',submenu:[{role:'undo'},{role:'redo'},{type:'separator'},{role:'cut'},{role:'copy'},{role:'paste'},{role:'selectAll'}]},{label:'View',submenu:[{role:'reload'},{role:'resetZoom'},{role:'zoomIn'},{role:'zoomOut'},{role:'togglefullscreen'}]}]));
 await window.loadURL(origin);
 if(smoke){await verifySmoke(true);app.quit();} else show();
}

async function verifySmoke(frontendLoaded) {
   const unauthorized=await fetch(origin+'/api/courses');
   if(unauthorized.status!==403)throw new Error('Session protection failed');
   const foreign=await fetch(origin+'/api/courses',{headers:{'x-studyspace-token':token,Origin:'https://example.com'}});
   if(foreign.status!==403)throw new Error('Origin protection failed');
   const courses=await (await api('/api/courses')).json();
   if(courses.length!==0)throw new Error('Distribution did not start empty');
   const created=await (await api('/api/courses',{method:'POST',body:JSON.stringify({name:'Desktop smoke test',color:'#a78bfa',syllabus:'Temporary test'})})).json();
   await api('/api/courses/'+created.id,{method:'DELETE'});
   await api('/api/music');await api('/api/settings/music');await api('/api/notifications/preview');
   const html = await (await api('/')).text();
   if(!html.includes('Studyspace'))throw new Error('Frontend resources missing');
   fs.writeFileSync(path.join(home,'smoke-result.json'),JSON.stringify({passed:true,packaged:app.isPackaged,frontendLoaded,frontendServed:true,sessionProtection:true,courseCRUD:true,port:prefs.port},null,2));
   log('Desktop smoke test passed');
}
