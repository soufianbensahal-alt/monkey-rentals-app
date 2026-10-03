import type { ClientDocument, FleetState } from '../types'
import { uploadPrivateFile } from './privateFiles'
import { uploadVehicleImage } from './vehicleImages'

const dataBlob=async(dataUrl:string)=>{const response=await fetch(dataUrl);return response.blob()}

export async function migrateLegacyMedia(state:FleetState):Promise<{state:FleetState;migrated:number}> {
  let migrated=0
  const vehicles=[] as FleetState['vehicles']
  for(const vehicle of state.vehicles) {
    if(!vehicle.image?.startsWith('data:image/')){vehicles.push(vehicle);continue}
    try {const stored=await uploadVehicleImage(await dataBlob(vehicle.image),vehicle.id);migrated++;vehicles.push({...vehicle,...stored})}catch{vehicles.push(vehicle)}
  }
  const clientDocuments=[] as FleetState['clientDocuments']
  for(const document of state.clientDocuments) {
    if(!document.dataUrl?.startsWith('data:')){clientDocuments.push(document);continue}
    try {
      const blob=await dataBlob(document.dataUrl)
      const file=new File([blob],document.fileName,{type:document.mimeType||blob.type})
      const stored=await uploadPrivateFile(file,{type:'client',recordId:document.id,customerId:document.customerId,documentType:document.type,notes:document.notes}) as ClientDocument
      migrated++;clientDocuments.push(stored)
    }catch{clientDocuments.push(document)}
  }
  return {state:{...state,vehicles,clientDocuments},migrated}
}
