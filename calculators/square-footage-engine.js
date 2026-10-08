/**
 * ToolVault Square Footage Calculator engine.
 * Canonical internal area unit: square metres.
 * Linear conversions use exact SI definitions: 1 in = 0.0254 m.
 */

export const LENGTH_TO_M = {
  mm: 0.001,
  cm: 0.01,
  m: 1,
  in: 0.0254,
  ft: 0.3048,
  yd: 0.9144
};

export const AREA_FROM_M2 = {
  m2: 1,
  ft2: 10.763910416709722,
  yd2: 1.1959900463010803
};

function positive(value){
  const n=Number(value);
  return Number.isFinite(n)&&n>=0?n:0;
}

function metres(value,unit){
  return positive(value)*(LENGTH_TO_M[unit]??1);
}

export function areaFromShape(shape,input={}){
  if(shape==="rectangle"){
    const lengthM=metres(input.length,input.lengthUnit);
    const widthM=metres(input.width,input.widthUnit||input.lengthUnit);
    return {areaM2:lengthM*widthM, formula:"length × width", inputs:{lengthM,widthM}};
  }
  if(shape==="triangle"){
    const baseM=metres(input.base,input.baseUnit);
    const heightM=metres(input.height,input.heightUnit||input.baseUnit);
    return {areaM2:0.5*baseM*heightM, formula:"½ × base × height", inputs:{baseM,heightM}};
  }
  if(shape==="circle"){
    const diameterM=metres(input.diameter,input.diameterUnit);
    return {areaM2:Math.PI*Math.pow(diameterM/2,2), formula:"π × (diameter ÷ 2)²", inputs:{diameterM}};
  }
  return {areaM2:0,formula:"",inputs:{}};
}

export function calculateSquareFootage(input={}){
  const shape=input.shape||"rectangle";
  const rows=Array.isArray(input.areas)?input.areas:[input];
  const items=rows.map(row=>areaFromShape(shape,row));
  const areaM2=items.reduce((sum,item)=>sum+item.areaM2,0);
  return {
    ok:areaM2>=0,
    shape,
    count:items.length,
    areaM2,
    areaFt2:areaM2*AREA_FROM_M2.ft2,
    areaYd2:areaM2*AREA_FROM_M2.yd2,
    items
  };
}

export const convertArea={
  m2ToFt2:m2=>positive(m2)*AREA_FROM_M2.ft2,
  ft2ToM2:ft2=>positive(ft2)/AREA_FROM_M2.ft2,
  m2ToYd2:m2=>positive(m2)*AREA_FROM_M2.yd2,
  yd2ToM2:yd2=>positive(yd2)/AREA_FROM_M2.yd2
};
