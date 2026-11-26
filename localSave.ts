import * as FileSystem from 'expo-file-system/legacy';

export type ExportFormat = 'pdf';
const MIME='application/pdf';

export function safeExportName(input:string,format:ExportFormat):string {
  const base=input.trim().replace(/\.(pdf|pptx)$/i,'').replace(/[\\/:*?"<>|\x00-\x1f]/g,'-').replace(/\s+/g,' ').replace(/[. ]+$/g,'').slice(0,100).replace(/[. ]+$/g,'');
  return `${base || 'Orbit Notes'}.${format}`;
}

async function writePDF(directory:string,sourceUri:string,name:string):Promise<string>{
  const base64=await FileSystem.readAsStringAsync(sourceUri,{encoding:FileSystem.EncodingType.Base64});
  const destination=await FileSystem.StorageAccessFramework.createFileAsync(directory,name,MIME);
  try{
    await FileSystem.writeAsStringAsync(destination,base64,{encoding:FileSystem.EncodingType.Base64});
    return destination;
  }catch(error){
    await FileSystem.deleteAsync(destination,{idempotent:true}).catch(()=>{});
    throw error;
  }
}

/** Ask Android for a destination folder. A cancelled picker creates no files. */
export async function saveExportToAndroid(sourceUri:string,filename:string,format:ExportFormat):Promise<string|null> {
  const permission=await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
  if(!permission.granted)return null;
  return writePDF(permission.directoryUri,sourceUri,safeExportName(filename,format));
}

export async function saveMultiplePDFsToAndroid(files:{uri:string;name:string}[]):Promise<{saved:string[];failed?:{name:string;error:unknown}}>{
  const permission=await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
  const saved:string[]=[];
  if(!permission.granted)return {saved};
  for(const file of files){
    const name=safeExportName(file.name,'pdf');
    try{
      await writePDF(permission.directoryUri,file.uri,name);
      saved.push(name);
    }catch(error){
      return {saved,failed:{name,error}};
    }
  }
  return {saved};
}
