import {writeFileSync} from 'node:fs';
import {FIELDS,toCSV} from '../public/core.mjs';
const base = {compound:'Compound A',endpoint:'IC50',relation:'=',value:'45',unit:'nM',mw_g_mol:'',target:'Enzyme-X / construct 1',organism:'Homo sapiens',system:'purified enzyme',protocol:'PX-01 / fluorescence',temperature_C:'25',pH:'7.4',incubation_min:'30',substrate_nM:'10000',enzyme_nM:'5',source:'Synthetic fixture; not a measured experimental result'};
const changes = [
 {id:'TX-001'},
 {id:'TX-002',compound:'Compound B',value:'0.12',unit:'uM'},
 {id:'TX-003',compound:'Compound C',value:'8.6',unit:'nM'},
 {id:'TX-004',compound:'Compound D',value:'10',unit:'uM',relation:'>'},
 {id:'TX-005',compound:'Compound A',value:'210',substrate_nM:'100000'},
 {id:'TX-006',compound:'Compound A',endpoint:'Ki',value:'18',substrate_nM:'NA'},
 {id:'TX-007',compound:'Compound E',value:'0.025',unit:'ug/mL',mw_g_mol:'500'},
 {id:'TX-008',compound:'Compound F',value:'65',temperature_C:''},
 {id:'TX-009',compound:'Compound G',value:'0.08',unit:'ug/mL',mw_g_mol:''}
];
writeFileSync(new URL('../public/example.csv',import.meta.url),toCSV(changes.map(c=>({...base,...c})),FIELDS).replaceAll('\r\n','\n')+'\n');
