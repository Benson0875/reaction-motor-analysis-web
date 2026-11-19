(function(root, factory) {
  if (typeof module === 'object') module.exports = factory(require('./sequential-core.js'),require('./environment-series.js'));
  else root.ReactionAnalysis = factory(root.Sequential,root.EnvironmentSeries);
})(globalThis, function(E,U) {
  'use strict';
  const VERSION = 'task-performance-v1';
  const sessionKey = r => [r.source,r.study_id,r.participant_id,r.session_id].join('|');
  const cohortKey = r => [r.source,r.study_id,r.protocol_id_study,r.task,r.protocol_id,r.input_config_id,r.timing_context_id||'prepost-snapshots-v1'].join('|');
  function importEntries(entries) {
    const items = [], failures = [], seen = new Set();
    for (const entry of entries) {
      try {
        if (seen.has(entry.name)) throw Error('Duplicate path');
        seen.add(entry.name);
        if (new TextEncoder().encode(entry.text).length > 262144) throw Error('JSON exceeds 256 KiB limit');
        const raw=JSON.parse(entry.text);
        const item = raw.schema===U.SCHEMA?U.parse(entry.text,entry.crc):E.parse(entry.text, entry.crc);
        if (item.record.calculation_version && item.record.calculation_version!==VERSION) throw Error('Unsupported calculation version');
        if(item.type==='record' && item.record.task==='key' && item.record.summary && item.record.summary.accuracy_pct!==undefined){
          const s=item.record.summary,correct=item.record.trials.filter(t=>t.outcome==='correct').length;
          if(s.total_trials!==32 || Math.abs(s.accuracy_pct-correct/32*100)>.00051) throw Error('Summary accuracy mismatch');
        }
        item.path = entry.name;
        items.push(item);
      } catch (e) { failures.push({path:entry.name, reason:e.message}); }
    }
    try{U.latest(items.filter(x=>x.type==='environment'));}catch(e){failures.push({path:'environment-checkpoints',reason:e.message});}
    return {items, failures, algorithm:VERSION};
  }
  function summary(item) {
    const r = item.record;
    if (r.task === 'wrist') return {algorithm:VERSION, unit:'ms', metric_ms:item.metric,
      completed:r.status === 'completed', elapsed_ms:r.elapsed_ms, accepted:r.accepted,
      wrong:r.wrong, path_px:r.layout_path_px, crossings:E.crossings(r.layout),
      min_distance_px:E.minDistance(r.layout)};
    const outcomes = {}, correct = [];
    for (const t of r.trials) {
      outcomes[t.outcome] = (outcomes[t.outcome] || 0) + 1;
      if (t.outcome === 'correct') correct.push(t.rt_ms);
    }
    return {algorithm:VERSION, unit:'ms', metric_ms:item.metric,
      median_ms:E.median(correct), correct:correct.length, total:r.trials.length,
      accuracy_pct:100 * correct.length / r.trials.length, outcomes,
      extra_presses:r.trials.reduce((n,t) => n+t.extra_press_count,0),
      sufficient:item.metric !== null};
  }
  function analyze(imported) {
    const items = imported.items, pairing = E.pairs(items);
    let environment=[];try{environment=U.latest(items.filter(x=>x.type==='environment')).filter(x=>!pairing.cancelledSessions.includes(sessionKey(x.record)));}catch(_){}
    const blocked = new Set(pairing.excluded.map(x => x.key));
    const completeness = new Set(pairing.incompleteSessions.map(x => x.key));
    // Existing parser pairing remains unchanged for old Excel consumers. The dashboard
    // adds a stricter formal-data gate; software matching is not research approval.
    const strictExcluded=[];
    const formal = pairing.included.filter(row => {
      const sk=sessionKey(row.slots.pre.record),reasons=[...row.quality];
      if(imported.failures.length)reasons.push('import_has_unreadable_or_unsupported_files');
      if(completeness.has(sk))reasons.push('session_stage_files_missing');
      const rs = items.filter(x => x.type === 'record' && sessionKey(x.record) === sk);
      if (rs.length!==4||new Set(rs.map(x => x.record.stage_id)).size !== 4) reasons.push('exactly_four_unique_stages_required');
      if(new Set(rs.map(x=>x.record.protocol_id_study)).size!==1)reasons.push('session_study_protocol_mismatch');
      const meta=items.filter(x=>x.type==='metadata'&&sessionKey(x.record)===sk);
      const infos=meta.filter(x=>x.record.schema==='ecochi-session-info-v1');
      const ends=meta.filter(x=>x.record.schema==='ecochi-session-complete-v1');
      if(infos.length!==1)reasons.push('exactly_one_session_info_required');
      if(ends.length!==1||ends[0]?.record.formal_blocks!==4)reasons.push('complete_marker_with_four_blocks_required');
      if(infos.length===1){
        const info=infos[0].record;
        if(info.boot_id&&rs.some(x=>x.record.boot_id!==info.boot_id))reasons.push('registration_boot_mismatch');
        if(info.protocol_id&&rs.some(x=>x.record.protocol_id_study!==info.protocol_id))reasons.push('registration_study_protocol_mismatch');
      }
      for(const x of rs){
        if(!x.crcValid)reasons.push('session_record_crc_invalid');
        if(x.quality.length)reasons.push(...x.quality.map(q=>x.record.stage_id+':'+q));
        if(blocked.has(sk+'|'+x.record.task))reasons.push('another_task_pair_excluded');
      }
      if(reasons.length){strictExcluded.push({key:row.key,reasons:[...new Set(reasons)]});return false;}
      return true;
    });
    const formalKeys = new Set(formal.map(x => x.key));
    const cancelled = new Set(pairing.cancelledSessions);
    const records = items.filter(x => x.type === 'record').map(item => ({...item,
      summary:summary(item), formalEligible:formalKeys.has(sessionKey(item.record)+'|'+item.record.task),
      cancelled:cancelled.has(sessionKey(item.record))}));
    const participants = new Set([...records,...environment].map(x => [x.record.source,x.record.study_id,x.record.participant_id].join('|'))).size;
    const sessions = new Set([...records,...environment].map(x => sessionKey(x.record))).size;
    return {algorithm:VERSION, records, participants, sessions, formal, pairing, strictExcluded, environment,
      failures:imported.failures, formalNote:'Eligibility is a software quality gate, not validated exercise exposure or clinical validity.'};
  }
  function compare(a,b) {
    const x=a.record, y=b.record;
    const comparable = x.phase==='pre' && y.phase==='post' && sessionKey(x)===sessionKey(y) &&
      cohortKey(x)===cohortKey(y) && ['age_years','locale','volume','form_pair_id','boot_id'].every(k => x[k]===y[k]);
    return {comparable, formal_eligible:comparable&&!!a.formalEligible&&!!b.formalEligible,
      change_ms:comparable && a.metric!==null && b.metric!==null ? b.metric-a.metric:null,
      accuracy_change_pp:comparable && x.task==='key' ? b.summary.accuracy_pct-a.summary.accuracy_pct:null};
  }
  function historicalBaseline(item,records){
    const r=item.record,id=r.historical_baseline_record_id;
    if(!id)return {status:'none'};
    if(!Number.isFinite(r.historical_baseline_time_ms)||r.historical_baseline_time_ms<0||r.task==='key'&&!Number.isFinite(r.historical_baseline_accuracy_pct))return {status:'invalid',id};
    const candidates=records.filter(x=>x.record.id===id&&x.record.source===r.source);
    if(!candidates.length)return {status:'not_imported',id,session:r.historical_baseline_session_id};
    if(candidates.length!==1)return {status:'invalid',id};
    const b=candidates[0],s=b.record;
    const compatible=cohortKey(s)===cohortKey(r)&&s.participant_id===r.participant_id&&s.phase===r.phase&&s.session_id===r.historical_baseline_session_id&&
      ['age_years','locale','volume','practice_wrist_attempts','practice_key_attempts'].every(k=>s[k]===r[k])&&b.crcValid&&!b.cancelled&&!s.test_skip_used&&s.status==='completed';
    if(!compatible||b.metric===null||Math.abs(b.metric-r.historical_baseline_time_ms)>.001)return {status:'invalid',id};
    if(r.task==='key'&&Math.abs(b.summary.accuracy_pct-r.historical_baseline_accuracy_pct)>.001)return {status:'invalid',id};
    return {status:'values_verified',id,session:s.session_id,time_ms:b.metric,change_ms:item.metric===null||r.sound_changed||r.test_skip_used?null:item.metric-b.metric,
      accuracy_change_pp:r.task==='key'&&item.metric!==null&&!r.sound_changed&&!r.test_skip_used?item.summary.accuracy_pct-b.summary.accuracy_pct:null};
  }
  function trialRows(item) {
    return item.record.task==='key' ? item.record.trials.map(t => ({...t,number:t.index+1,
      direction_label:['UP','DOWN','LEFT','RIGHT'][t.direction]})) : [];
  }
  const quote = v => '"'+String(v??'').replaceAll('"','""')+'"';
  function trialCSV(items) {
    const rows = [['algorithm','source','participant','session','stage','trial','direction','outcome','rt_ms','frame_start_ms','frame_end_ms','candidate_ms','confirmed_ms','extra_presses','test_skip_used','protocol_id','trial_start_ms','trial_end_ms']];
    for (const item of items.filter(x => x.type==='record'&&x.record.task==='key')) {
      const r=item.record;
      for (const t of trialRows(item)) rows.push([VERSION,r.source,r.participant_id,r.session_id,r.stage_id,t.number,t.direction_label,t.outcome,t.rt_ms,t.frame_start_ms,t.frame_end_ms,t.candidate_ms,t.confirmed_ms,t.extra_press_count,r.test_skip_used===true,r.protocol_id,t.trial_start_ms,t.trial_end_ms]);
    }
    return rows.map(row => row.map(quote).join(',')).join('\r\n');
  }
  return {VERSION,sessionKey,cohortKey,importEntries,summary,analyze,compare,historicalBaseline,trialRows,trialCSV};
});
