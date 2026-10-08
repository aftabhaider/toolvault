/**
 * ToolVault Mulch Calculator engine
 * Internal geometry is normalized to metres and cubic metres.
 * Display rounding belongs in the UI, not in the calculation engine.
 */

const FT_TO_M = 0.3048;
const IN_TO_M = 0.0254;
const M2_TO_FT2 = 10.763910416709722;
const M3_TO_FT3 = 35.31466672148859;
const M3_TO_YD3 = 1.307950619314392;
const M3_TO_LITERS = 1000;

export const conversions={FT_TO_M,IN_TO_M,M2_TO_FT2,M3_TO_FT3,M3_TO_YD3,M3_TO_LITERS};

export function positive(value,fallback=0){
  const n=Number(value);
  return Number.isFinite(n)&&n>=0?n:fallback;
}

function shapeAreaM2(item){
  const shape=item?.shape==="circle"||item?.shape==="tree-ring"||item?.shape==="triangle"?item.shape:"rectangle";
  if(shape==="circle"){
    const d=positive(item.diameterM);
    return Math.PI*Math.pow(d/2,2);
  }
  if(shape==="tree-ring"){
    const outer=positive(item.outerDiameterM);
    const inner=Math.min(outer,positive(item.innerDiameterM));
    return Math.max(0,Math.PI/4*(outer*outer-inner*inner));
  }
  if(shape==="triangle"){
    return 0.5*positive(item.baseM)*positive(item.heightM);
  }
  return positive(item.lengthM)*positive(item.widthM);
}

export function calculateMulch(input={}){
  const beds=Array.isArray(input.beds)?input.beds:[];
  const targetDepthM=Math.max(0,positive(input.targetDepthM,0.0762)); // 3 inches default
  const existingDepthM=Math.min(targetDepthM,Math.max(0,positive(input.existingDepthM,0)));
  const appliedDepthM=Math.max(0,targetDepthM-existingDepthM);
  const wastePercent=Math.max(0,positive(input.wastePercent,5));
  const bagSizeFt3=Math.max(Number.EPSILON,positive(input.bagSizeFt3,2));
  const densityTPerM3=Math.max(0,positive(input.densityTPerM3,0));
  const bulkPricePerYd3=Math.max(0,positive(input.bulkPricePerYd3,0));
  const bagPrice=Math.max(0,positive(input.bagPrice,0));

  let totalAreaM2=0;
  const breakdown=beds.map((bed,index)=>{
    const areaM2=shapeAreaM2(bed);
    const volumeM3=areaM2*appliedDepthM;
    totalAreaM2+=areaM2;
    return {
      index:index+1,
      shape:bed?.shape||"rectangle",
      areaM2,
      volumeM3
    };
  });

  const netVolumeM3=breakdown.reduce((sum,row)=>sum+row.volumeM3,0);
  const orderVolumeM3=netVolumeM3*(1+wastePercent/100);
  const cubicFeet=orderVolumeM3*M3_TO_FT3;
  const cubicYards=orderVolumeM3*M3_TO_YD3;
  const bags=Math.ceil(cubicFeet/bagSizeFt3);
  const weightTonnes=densityTPerM3>0?orderVolumeM3*densityTPerM3:null;
  const bulkCost=bulkPricePerYd3>0?cubicYards*bulkPricePerYd3:null;
  const bagCost=bagPrice>0?bags*bagPrice:null;
  const costDifference=(bulkCost!=null&&bagCost!=null)?bagCost-bulkCost:null;

  const sqFtPerYardAtDepth=targetDepthM>0?((1/M3_TO_YD3)/targetDepthM)*M2_TO_FT2:0;
  const coveragePerYardFt2=sqFtPerYardAtDepth;

  return {
    beds:breakdown,totalAreaM2,netVolumeM3,orderVolumeM3,cubicFeet,cubicYards,
    bags,bagSizeFt3,appliedDepthM,targetDepthM,existingDepthM,wastePercent,
    densityTPerM3,weightTonnes,bulkPricePerYd3,bulkCost,bagPrice,bagCost,costDifference,
    sqFtPerYardAtDepth,coveragePerYardFt2
  };
}
