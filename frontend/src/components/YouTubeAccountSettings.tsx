import {useEffect,useState} from 'react';
import {request} from '../lib/api';
type Account={client_id:string;redirect_uri:string;has_client_secret:boolean;connected:boolean;configured:boolean};
export function YouTubeAccountSettings(){
 const [account,setAccount]=useState<Account>();const [secret,setSecret]=useState('');const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');const [message,setMessage]=useState('');const [authUrl,setAuthUrl]=useState('');
 async function refresh(){try{const value=await request<Account>('/youtube/account/settings');setAccount({...value,redirect_uri:value.redirect_uri||location.origin+'/api/youtube/account/callback'})}catch(e){setError((e as Error).message)}}
 useEffect(()=>{void refresh()},[]);
 async function save(){if(!account)return;setBusy(true);setError('');setAuthUrl('');try{const value=await request<Account>('/youtube/account/settings','PUT',{client_id:account.client_id,redirect_uri:account.redirect_uri,client_secret:secret});setAccount(value);setSecret('');setMessage('OAuth settings saved. Choose Connect, then continue to Google.')}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 async function connect(){setBusy(true);setError('');setMessage('');try{const value=await request<{url:string}>('/youtube/account/connect','POST',{});setAuthUrl(value.url)}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 async function disconnect(){setBusy(true);setError('');setAuthUrl('');try{const result=await request<{revoked:boolean}>('/youtube/account/disconnect','POST',{});await refresh();setMessage(result.revoked?'Account disconnected and Google access revoked.':'Local account access removed. If needed, remove Studyspace from your Google account’s third-party connections too.')}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 return <section className="panel settings-card"><h2>YouTube account & playlists</h2><p>Connect your account to list and import your playlists. Studyspace requests read-only YouTube access. This does not sign the embedded player into your Google account or unlock restricted videos.</p>
 {account&&<><p>Status: <strong>{account.connected?'Connected':'Not connected'}</strong></p><form onSubmit={e=>{e.preventDefault();void save()}}>
 <label>OAuth Web client ID<input value={account.client_id} onChange={e=>setAccount({...account,client_id:e.target.value})} placeholder="…apps.googleusercontent.com"/></label>
 <label>OAuth client secret<input type="password" autoComplete="new-password" value={secret} onChange={e=>setSecret(e.target.value)} placeholder={account.has_client_secret?'Leave blank to keep saved secret':'Google OAuth client secret'}/></label>
 <label>Authorized redirect URI<input value={account.redirect_uri} onChange={e=>setAccount({...account,redirect_uri:e.target.value})}/></label>
 <button className="button" disabled={busy}>Save account settings</button></form>
 <div className="settings-links"><button className="button" disabled={busy||!account.configured} onClick={()=>void connect()}>{account.connected?'Reconnect YouTube':'Connect YouTube'}</button><button className="button" disabled={busy} onClick={()=>void refresh()}>Refresh connection</button>{account.connected&&<button className="button" disabled={busy} onClick={()=>void disconnect()}>Disconnect</button>}</div></>}
 {authUrl&&<a className="button primary" href={authUrl} target="_blank" rel="noopener noreferrer">Continue to Google sign-in ↗</a>}
 {message&&<p role="status">{message}</p>}{error&&<p className="form-error" role="alert">{error}</p>}
 <details><summary>One-time Google Cloud setup</summary><p>Enable YouTube Data API v3, configure the OAuth consent screen, and create a Web application OAuth client. Add the exact redirect URI above in Google Cloud. If the consent screen is in Testing, add your Google account as a test user. Use the app from that same localhost/HTTPS origin and complete sign-in in the same browser. Then return here and refresh the connection, or open Music → My playlists.</p><p>Client secrets and tokens are encrypted locally using email.key. Changing the OAuth client or redirect disconnects the existing account. This connection is for the web/Docker version; desktop sign-in will need its own system-browser flow in the next desktop build.</p><a href="https://developers.google.com/youtube/v3/guides/auth/server-side-web-apps" target="_blank" rel="noreferrer">Google’s OAuth setup guide ↗</a></details>
 </section>;
}
