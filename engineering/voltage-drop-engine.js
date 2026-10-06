// ToolVault Voltage Drop Engine v1
// Resistance-based planning model referenced to 20°C conductor resistivity.
// AC reactance, conduit effects, temperature correction, ampacity and code-specific
// installation factors are intentionally outside this base model.

export const RHO_OHM_M = { copper:1.724e-8, aluminum:2.65e-8 };
export const PHASE_FACTOR = { dc:2, single:2, three:Math.sqrt(3) };

export const METRIC_SIZES_MM2=[0.5,0.75,1,1.5,2.5,4,6,10,16,25,35,50,70,95,120,150,185,240,300,400,500,630];
export const AWG_SIZES=[
  {label:"14 AWG",n:14},{label:"12 AWG",n:12},{label:"10 AWG",n:10},{label:"8 AWG",n:8},
  {label:"6 AWG",n:6},{label:"4 AWG",n:4},{label:"3 AWG",n:3},{label:"2 AWG",n:2},{label:"1 AWG",n:1},
  {label:"1/0 AWG",n:0},{label:"2/0 AWG",n:-1},{label:"3/0 AWG",n:-2},{label:"4/0 AWG",n:-3}
];

export function positive(x){const n=Number(x);return Number.isFinite(n)?Math.max(0,n):0}

export function awgAreaMm2(n){
  // Standard AWG diameter relation: d(mm)=0.127*92^((36-n)/39)
  const diameterMm=0.127*Math.pow(92,(36-Number(n))/39);
  return Math.PI*Math.pow(diameterMm/2,2);
}

export function awgCircularMils(n){
  // 1 circular mil = circular area based on diameter in mils.
  const diameterMil=5*Math.pow(92,(36-Number(n))/39);
  return diameterMil*diameterMil;
}

export function resistanceOhmPerMeter({material,areaMm2,rhoOverride=null}){
  const area=positive(areaMm2);
  if(!(area>0)) throw new Error("Conductor area must be greater than zero.");
  const rho=rhoOverride!==null?positive(rhoOverride):RHO_OHM_M[material];
  if(!(rho>0)) throw new Error("Resistivity must be greater than zero.");
  return rho/(area*1e-6);
}

export function calculateVoltageDrop(input){
  const sourceV=positive(input.sourceV);
  if(!(sourceV>0)) throw new Error("Supply voltage must be greater than zero.");
  const I=positive(input.currentA),L=positive(input.lengthM),A=positive(input.areaMm2);
  if(!(I>0)) throw new Error("Load current must be greater than zero.");
  if(!(L>0)) throw new Error("One-way cable length must be greater than zero.");
  if(!(A>0)) throw new Error("Conductor area must be greater than zero.");
  const factor=PHASE_FACTOR[input.system];
  if(!factor) throw new Error("Unsupported circuit system.");
  const rPerM=resistanceOhmPerMeter({material:input.material,areaMm2:A,rhoOverride:input.rhoOverride??null});
  const volts=factor*I*L*rPerM;
  const percent=volts/sourceV*100;
  const loadV=sourceV-volts;
  const powerLossW=I*volts;
  const hours=Math.max(0,Number(input.hoursPerDay)||0);
  return {
    volts,percent,loadV,rPerM,powerLossW,
    energyLossKWhPerDay:powerLossW*hours/1000,
    factor
  };
}

export function maxLengthForDrop({sourceV,targetPercent,currentA,areaMm2,material,system,rhoOverride=null}){
  const Vmax=positive(sourceV)*positive(targetPercent)/100;
  const I=positive(currentA),A=positive(areaMm2),factor=PHASE_FACTOR[system];
  const rPerM=resistanceOhmPerMeter({material,areaMm2:A,rhoOverride});
  return Vmax/(factor*I*rPerM);
}

export function minimumAreaForDrop({sourceV,targetPercent,currentA,lengthM,material,system,rhoOverride=null}){
  const Vmax=positive(sourceV)*positive(targetPercent)/100;
  const I=positive(currentA),L=positive(lengthM),factor=PHASE_FACTOR[system];
  const rho=rhoOverride!==null?positive(rhoOverride):RHO_OHM_M[material];
  if(!(Vmax>0&&I>0&&L>0&&rho>0)) throw new Error("Supply voltage, target drop, current, length and resistivity must be positive.");
  return factor*I*L*rho/(Vmax*1e-6);
}