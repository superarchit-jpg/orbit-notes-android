/** Local-only rich text editor. No remote pages or network requests. */
import React,{forwardRef,useImperativeHandle,useMemo,useRef} from 'react';
import {View} from 'react-native';
import WebView from 'react-native-webview';

export type RichEditorAction='bold'|'italic'|'underline'|'bullets'|'numbers';
export type RichNoteEditorHandle={format:(action:RichEditorAction)=>void};
type Props={initialText:string;onChangeText:(text:string)=>void;dark:boolean;textColor:string;backgroundColor:string};

const escapeHtml=(value:string)=>value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const inlineHtml=(line:string)=>escapeHtml(line).replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>').replace(/__([^_]+)__/g,'<u>$1</u>').replace(/\*([^*]+)\*/g,'<em>$1</em>');
export function markupToHtml(body:string):string{
  const parts:string[]=[];let mode:'ul'|'ol'|null=null;
  const close=()=>{if(mode){parts.push('</'+mode+'>');mode=null;}};
  for(const line of body.split('\n')){
    const bullet=line.match(/^•\s(.*)$/),number=line.match(/^\d+\.\s(.*)$/);
    const next=bullet?'ul':number?'ol':null;
    if(next!==mode){close();if(next){parts.push('<'+next+'>');mode=next;}}
    if(next)parts.push('<li>'+inlineHtml((bullet||number)![1])+'</li>');
    else parts.push('<div>'+ (line?inlineHtml(line):'<br>')+'</div>');
  }
  close();return parts.join('')||'<div><br></div>';
}

const RichNoteEditor=forwardRef<RichNoteEditorHandle,Props>(function RichNoteEditor({initialText,onChangeText,dark,textColor,backgroundColor},ref){
  const web=useRef<WebView>(null);
  const original=useRef(initialText);
  const callback=useRef(onChangeText);callback.current=onChangeText;
  const html=useMemo(()=>{
    const safeContent=JSON.stringify(markupToHtml(original.current)).replace(/</g,'\\u003c');
    const color=/^#[0-9a-fA-F]{6}$/.test(textColor)?textColor:'#202124',background=/^#[0-9a-fA-F]{6}$/.test(backgroundColor)?backgroundColor:'#ffffff';
    return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"/>
<style>
html,body{margin:0;padding:0;background:${background};color:${color};font-family:Roboto,"Arial",sans-serif;font-size:17px;line-height:1.6;overflow-wrap:anywhere}
#editor{min-height:95vh;padding:12px 6px;outline:none;white-space:normal}
#editor div,#editor p{min-height:1.6em}ul,ol{padding-left:28px;margin:0}li{min-height:1.6em}
</style></head><body><main id="editor" contenteditable="true" role="textbox" aria-label="Note content"></main>
<script>(function(){
const editor=document.getElementById('editor');editor.innerHTML=${safeContent};
let selectionRange=null;
document.addEventListener('selectionchange',()=>{const s=getSelection();if(s&&s.rangeCount&&editor.contains(s.anchorNode)){selectionRange=s.getRangeAt(0).cloneRange();}});
function inline(node){
 if(node.nodeType===3)return node.nodeValue||'';
 if(node.nodeType!==1)return '';
 const tag=node.tagName.toLowerCase();
 if(tag==='br')return '\\n';
 const content=Array.from(node.childNodes).map(inline).join('');
 if(tag==='strong'||tag==='b')return '**'+content+'**';
 if(tag==='em'||tag==='i')return '*'+content+'*';
 if(tag==='u')return '__'+content+'__';
 return content;
}
function block(node){
 if(node.nodeType===3)return node.nodeValue||'';
 if(node.nodeType!==1)return '';
 const tag=node.tagName.toLowerCase();
 if(tag==='ul'||tag==='ol')return Array.from(node.children).map((n,i)=>(tag==='ul'?'• ':(i+1)+'. ')+Array.from(n.childNodes).map(inline).join('').replace(/\\n$/,'')).join('\\n');
 if(tag==='br')return '';
 return Array.from(node.childNodes).map(inline).join('').replace(/\\n$/,'');
}
function serialize(){return Array.from(editor.childNodes).map(block).join('\\n').replace(/\\n{3,}/g,'\\n\\n');}
function send(){window.ReactNativeWebView.postMessage(JSON.stringify({type:'change',text:serialize()}));}
editor.addEventListener('input',send);
document.addEventListener('message',e=>command(e.data));
window.addEventListener('message',e=>command(e.data));
function command(raw){let m;try{m=JSON.parse(raw);}catch{return;}if(m.type!=='format')return;
 editor.focus();
 if(selectionRange){const s=getSelection();s.removeAllRanges();s.addRange(selectionRange);}
 const commands={bold:'bold',italic:'italic',underline:'underline',bullets:'insertUnorderedList',numbers:'insertOrderedList'};
 if(commands[m.action])document.execCommand(commands[m.action],false,null);
 send();
}
})();</script></body></html>`;
  },[]);
  useImperativeHandle(ref,()=>({format(action){web.current?.injectJavaScript(`window.dispatchEvent(new MessageEvent('message',{data:${JSON.stringify(JSON.stringify({type:'format',action}))}}));true;`);}}),[]);
  return <View style={{flex:1,minHeight:160,overflow:'hidden',borderRadius:14,backgroundColor}}>
    <WebView ref={web} source={{html}} style={{flex:1,backgroundColor}} scrollEnabled keyboardDisplayRequiresUserAction={false}
      originWhitelist={['about:blank','data:*']} onShouldStartLoadWithRequest={request=>request.url==='about:blank'||request.url.startsWith('data:')}
      onMessage={event=>{try{const message=JSON.parse(event.nativeEvent.data);if(message.type==='change'&&typeof message.text==='string')callback.current(message.text);}catch{}}}
      javaScriptEnabled domStorageEnabled={false} allowFileAccess={false} setSupportMultipleWindows={false}
      mixedContentMode="never" accessibilityLabel="Note content"/>
  </View>;
});
export default RichNoteEditor;
