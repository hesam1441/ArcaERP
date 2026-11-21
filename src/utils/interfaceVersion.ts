export const INTERFACE_VERSION_KEY='arca.interface.version';
export type InterfaceVersion='new'|'legacy';
export function readInterfaceVersion():InterfaceVersion {try{return localStorage.getItem(INTERFACE_VERSION_KEY)==='legacy'?'legacy':'new';}catch{return 'new';}}
export function saveInterfaceVersion(version:InterfaceVersion) {try{localStorage.setItem(INTERFACE_VERSION_KEY,version);}catch{}}
