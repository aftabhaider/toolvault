// ToolVault Concrete Engine v1
// Pure calculation functions. Keep UI code out of this file.
// All geometry is normalized to metres before calculation.

export const FT_TO_M = 0.3048;
export const IN_TO_M = 0.0254;
export const M3_TO_FT3 = 35.3146667215;
export const M3_TO_YD3 = 1.3079506193;
export const KG_PER_TONNE = 1000;

export function clampNonNegative(value){
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0,n) : 0;
}

export function rectangularVolume(lengthM,widthM,depthM,quantity=1){
  return clampNonNegative(lengthM)*clampNonNegative(widthM)*clampNonNegative(depthM)*Math.max(0,Number(quantity)||0);
}

export function cylindricalVolume(diameterM,heightM,quantity=1){
  const d=clampNonNegative(diameterM), h=clampNonNegative(heightM), q=Math.max(0,Number(quantity)||0);
  return Math.PI*Math.pow(d/2,2)*h*q;
}

export function ringVolume(outerDiameterM,innerDiameterM,heightM,quantity=1){
  const od=clampNonNegative(outerDiameterM), id=clampNonNegative(innerDiameterM), h=clampNonNegative(heightM), q=Math.max(0,Number(quantity)||0);
  if(id>od) throw new Error("Inner diameter cannot be greater than outer diameter.");
  return Math.PI/4*(od*od-id*id)*h*q;
}

export function calculateElement(element){
  const q=Math.max(0,Number(element.quantity)||0);
  switch(element.shape){
    case "slab":
    case "footing":
    case "wall":
      return rectangularVolume(element.lengthM,element.widthM,element.depthM,q);
    case "round":
      return cylindricalVolume(element.diameterM,element.heightM,q);
    case "ring":
      return ringVolume(element.outerDiameterM,element.innerDiameterM,element.heightM,q);
    default:
      throw new Error("Unsupported concrete element.");
  }
}

export function calculateProject(elements,{wastePercent=0,densityKgM3=2400,price=0,priceUnit="m3",bagYield=0,bagYieldUnit="ft3"}={}){
  const netM3=elements.reduce((sum,e)=>sum+calculateElement(e),0);
  const waste=Math.max(0,Number(wastePercent)||0);
  const grossM3=netM3*(1+waste/100);
  const density=Math.max(0,Number(densityKgM3)||0);
  const weightKg=grossM3*density;
  const priceValue=Math.max(0,Number(price)||0);
  const priceBasis=priceUnit==="yd3"?grossM3*M3_TO_YD3:grossM3;
  const cost=priceValue>0?priceBasis*priceValue:null;
  const yieldValue=Math.max(0,Number(bagYield)||0);
  let bags=null;
  if(yieldValue>0){
    const quantityInSelectedUnit=bagYieldUnit==="m3"?grossM3:bagYieldUnit==="yd3"?grossM3*M3_TO_YD3:grossM3*M3_TO_FT3;
    bags=Math.ceil(quantityInSelectedUnit/yieldValue);
  }
  return {
    netM3,grossM3,weightKg,weightTonnes:weightKg/KG_PER_TONNE,
    ft3:grossM3*M3_TO_FT3,yd3:grossM3*M3_TO_YD3,litres:grossM3*1000,
    cost,bags
  };
}

export function imperialPairToM(feet,inches){
  return (clampNonNegative(feet)+clampNonNegative(inches)/12)*FT_TO_M;
}

export function metresToImperialPair(m){
  const totalIn=clampNonNegative(m)/IN_TO_M;
  const ft=Math.floor(totalIn/12);
  const inches=totalIn-ft*12;
  return {ft,inches};
}

export function metresToFtIn(m){
  return metresToImperialPair(m);
}

export function roundForDisplay(n,digits=2){
  return Number(n).toLocaleString(undefined,{minimumFractionDigits:digits,maximumFractionDigits:digits});
}
