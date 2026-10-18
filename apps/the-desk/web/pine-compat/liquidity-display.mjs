// The supplied reference has a five-pixel dash and six-pixel gap at width 1.
// Preserve the Pine geometry and style; attach only the measured raster pattern.
export function liquidityDisplayModel(model){
 return {...model,lines:model.lines.map(line=>line.style==='dashed'&&line.width===1?{...line,deskDashPattern:[5,6]}:line)};
}
