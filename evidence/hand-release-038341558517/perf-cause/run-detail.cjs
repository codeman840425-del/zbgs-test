const path=require('node:path');
process.env.QA_M1_BUILD='038341558517';
process.env.QA_PERF_CASES='skirt-sit-hold';
process.env.QA_PERF_DETAIL='1';
process.env.QA_PERF_SECONDS='30';
process.env.QA_M1_RUN_ROOT=path.join(__dirname,'detail');
require('../../../scripts/qa-m1-current-perf.cjs');
