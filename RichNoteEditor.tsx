/** Local-only rich text editor. No remote pages or network requests. */
import React,{forwardRef,useImperativeHandle,useMemo,useRef} from 'react';
import {View} from 'react-native';
import WebView from 'react-native-webview';
import {markupToHtml} from './richTextMarkup';

export type RichEditorAction='bold'|'italic'|'underline'|'bullets'|'numbers'|'clear'|'undo'|'redo';
export type RichNoteEditorHandle={format:(action:RichEditorAction)=>void};
export type RichEditorState={bold:boolean;italic:boolean;underline:boolean;bullets:boolean;numbers:boolean;canUndo:boolean;canRedo:boolean};
type Props={initialText:string;onChangeText:(text:string)=>void;onFormatStateChange?:(state:Partial<RichEditorState>)=>void;onReady:()=>void;textColor:string;backgroundColor:string};

const RichNoteEditor=forwardRef<RichNoteEditorHandle,Props>(function RichNoteEditor({initialText,onChangeText,onFormatStateChange,onReady,textColor,backgroundColor},ref){
  const web=useRef<WebView>(null);
  const original=useRef(initialText);
  const callback=useRef(onChangeText);callback.current=onChangeText;
  const stateCallback=useRef(onFormatStateChange);stateCallback.current=onFormatStateChange;
  const html=useMemo(()=>{
    const safeContent=JSON.stringify(markupToHtml(original.current)).replace(/</g,'\\u003c');
    const color=/^#[0-9a-fA-F]{6}$/.test(textColor)?textColor:'#202124',background=/^#[0-9a-fA-F]{6}$/.test(backgroundColor)?backgroundColor:'#ffffff';
    return `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; form-action 'none'"/><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"/>
<style>
html,body{margin:0;padding:0;background:${background};color:${color};font-family:Roboto,"Arial",sans-serif;font-size:17px;line-height:1.6;overflow-wrap:anywhere}
#editor{min-height:95vh;padding:12px 6px;outline:none;white-space:normal}
#editor div,#editor p{min-height:1.6em}ul,ol{padding-left:28px;margin:0}li{min-height:1.6em}
</style></head><body><main id="editor" contenteditable="true" role="textbox" aria-label="Note content"></main>
<script>(function(){
const editor=document.getElementById('editor');editor.innerHTML=${safeContent};
let selectionRange=null;let undoStack=[],redoStack=[];
function selectionOffsets(){
 const selection=getSelection();
 if(!selection||!selection.rangeCount||!editor.contains(selection.anchorNode))return {start:0,end:0};
 const range=selection.getRangeAt(0),probe=range.cloneRange();
 probe.selectNodeContents(editor);probe.setEnd(range.startContainer,range.startOffset);
 const start=probe.toString().length;
 probe.setEnd(range.endContainer,range.endOffset);
 return {start,end:probe.toString().length};
}
function restoreOffsets(start,end){
 editor.focus();
 const walker=document.createTreeWalker(editor,NodeFilter.SHOW_TEXT);
 let node,offset=0,first=null,last=null;
 const range=document.createRange();
 while((node=walker.nextNode())){
  const limit=offset+node.nodeValue.length;
  if(!first&&start<=limit)first={node,at:Math.max(0,start-offset)};
  if(!last&&end<=limit)last={node,at:Math.max(0,end-offset)};
  offset=limit;
 }
 if(!first)return;
 try{
  range.setStart(first.node,Math.min(first.at,first.node.nodeValue.length));
  range.setEnd((last||first).node,Math.min((last||first).at,(last||first).node.nodeValue.length));
  const selection=getSelection();selection.removeAllRanges();selection.addRange(range);selectionRange=range.cloneRange();
 }catch{}
}
function snapshot(){return {html:editor.innerHTML,...selectionOffsets()};}
let lastSnapshot=snapshot();
function historyState(){window.ReactNativeWebView.postMessage(JSON.stringify({type:'historyState',canUndo:undoStack.length>0,canRedo:redoStack.length>0}));}
function recordHistory(){const value=snapshot();if(value.html===lastSnapshot.html)return;undoStack.push(lastSnapshot);if(undoStack.length>100)undoStack.shift();redoStack=[];lastSnapshot=value;historyState();}
function restoreHistory(type){const from=type==='undo'?undoStack:redoStack,to=type==='undo'?redoStack:undoStack;if(!from.length)return;to.push(snapshot());const previous=from.pop();editor.innerHTML=previous.html;lastSnapshot=previous;restoreOffsets(previous.start,previous.end);send();sendState();historyState();}
document.execCommand('styleWithCSS',false,false);
function sendState(){try{const keys={bold:'bold',italic:'italic',underline:'underline',bullets:'insertUnorderedList',numbers:'insertOrderedList'};const state={};Object.keys(keys).forEach(key=>{state[key]=!!document.queryCommandState(keys[key]);});window.ReactNativeWebView.postMessage(JSON.stringify({type:'formatState',state}));}catch{}}
document.addEventListener('selectionchange',()=>{const s=getSelection();if(s&&s.rangeCount&&editor.contains(s.anchorNode)){selectionRange=s.getRangeAt(0).cloneRange();sendState();}});
function inline(node){
 if(node.nodeType===3)return node.nodeValue||'';
 if(node.nodeType!==1)return '';
 const tag=node.tagName.toLowerCase();
 if(tag==='br')return '\\n';
 const content=Array.from(node.childNodes).map(inline).join('');
 // Apply markers per stored line and leave blank lines unformatted.
 const marker=tag==='strong'||tag==='b'?'**':tag==='em'||tag==='i'?'*':tag==='u'?'__':'';
 if(marker)return content.split('\\n').map(line=>line.trim()?marker+line+marker:line).join('\\n');
 return content;
}
function list(node,depth){
 const ordered=node.tagName.toLowerCase()==='ol';
 let value=Number(node.getAttribute('start')||1);
 const result=[];
 for(const item of node.children){
  if(item.tagName.toLowerCase()!=='li')continue;
  if(item.hasAttribute('value'))value=Number(item.getAttribute('value'));
  const isList=child=>child.nodeType===1&&['ul','ol'].includes(child.tagName.toLowerCase());
  const children=Array.from(item.childNodes);
  const text=children.filter(child=>!isList(child)).map(inline).join('').replace(/\\n$/,'');
  result.push('  '.repeat(depth)+(ordered?value+'. ':'• ')+text);
  for(const child of children.filter(isList))result.push(...list(child,depth+1));
  value++;
 }
 return result;
}
function block(node){
 if(node.nodeType===3)return [node.nodeValue||''];
 if(node.nodeType!==1)return [];
 const tag=node.tagName.toLowerCase();
 if(tag==='ol'||tag==='ul')return list(node,0);
 if(tag==='div'||tag==='p'){
  const nested=Array.from(node.childNodes).some(child=>child.nodeType===1&&['ol','ul'].includes(child.tagName.toLowerCase()));
  if(nested)return Array.from(node.childNodes).flatMap(block);
 }
 if(tag==='br')return [''];
 return [inline(node).replace(/\\n$/,'')];
}
function serialize(){return Array.from(editor.childNodes).flatMap(block).join('\\n');}
function send(){window.ReactNativeWebView.postMessage(JSON.stringify({type:'change',text:serialize()}));}
editor.addEventListener('input',()=>{recordHistory();send();sendState();});
editor.addEventListener('paste',event=>{event.preventDefault();const value=event.clipboardData?.getData('text/plain')||'';document.execCommand('insertText',false,value);});
document.addEventListener('message',e=>command(e.data));
window.addEventListener('message',e=>command(e.data));
function command(raw){let m;try{m=JSON.parse(raw);}catch{return;}if(m.type!=='format')return;
 if(m.action==='undo'||m.action==='redo'){restoreHistory(m.action);return;}
 editor.focus();
 if(selectionRange){const s=getSelection();s.removeAllRanges();s.addRange(selectionRange);}
 const commands={bold:'bold',italic:'italic',underline:'underline',bullets:'insertUnorderedList',numbers:'insertOrderedList',clear:'removeFormat'};
 if(commands[m.action])document.execCommand(commands[m.action],false,null);
 recordHistory();send();sendState();
}
window.ReactNativeWebView.postMessage(JSON.stringify({type:'ready'}));
})();</script></body></html>`;
  },[]);
  useImperativeHandle(ref,()=>({format(action){web.current?.injectJavaScript(`window.dispatchEvent(new MessageEvent('message',{data:${JSON.stringify(JSON.stringify({type:'format',action}))}}));true;`);}}),[]);
  return <View style={{flex:1,minHeight:160,overflow:'hidden',borderRadius:14,backgroundColor}}>
    <WebView ref={web} source={{html}} style={{flex:1,backgroundColor}} scrollEnabled keyboardDisplayRequiresUserAction={false}
      originWhitelist={['about:blank','data:*']} onShouldStartLoadWithRequest={request=>request.url==='about:blank'||request.url.startsWith('data:')}
      onMessage={event=>{try{const message=JSON.parse(event.nativeEvent.data);if(message.type==='ready')onReady();if(message.type==='change'&&typeof message.text==='string')callback.current(message.text);if(message.type==='formatState'&&message.state)stateCallback.current?.(message.state);if(message.type==='historyState')stateCallback.current?.({canUndo:!!message.canUndo,canRedo:!!message.canRedo});}catch{}}}
      javaScriptEnabled domStorageEnabled={false} allowFileAccess={false} setSupportMultipleWindows={false}
      mixedContentMode="never" accessibilityLabel="Note content"/>
  </View>;
});
export default RichNoteEditor;
