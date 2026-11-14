import * as FileSystem from 'expo-file-system/legacy';

export type ExportFormat = 'pdf' | 'pptx';
const MIME: Record<ExportFormat,string> = {
  pdf: 'application/pdf',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

export function safeExportName(input:string,format:ExportFormat):string {
  const base=input.trim().replace(/\.(pdf|pptx)$/i,'').replace(/[\\/:*?"<>|\x00-\x1f]/g,'-').replace(/\s+/g,' ').replace(/[. ]+$/g,'').slice(0,100);
  return `${base || 'Orbit Notes'}.${format}`;
}

/** Android SAF: ask the user for a destination folder, then create a new document.
 * No broad storage permission and no system share sheet are required.
 * SAF providers typically avoid overwriting by choosing a unique name.
 */
export async function saveExportToAndroid(sourceUri:string,filename:string,format:ExportFormat):Promise<string|null> {
  const permission=await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
  if(!permission.granted) return null;
  const name=safeExportName(filename,format);
  const base64=await FileSystem.readAsStringAsync(sourceUri,{encoding:FileSystem.EncodingType.Base64});
  const destination=await FileSystem.StorageAccessFramework.createFileAsync(permission.directoryUri,name,MIME[format]);
  await FileSystem.writeAsStringAsync(destination,base64,{encoding:FileSystem.EncodingType.Base64});
  return destination;
}
