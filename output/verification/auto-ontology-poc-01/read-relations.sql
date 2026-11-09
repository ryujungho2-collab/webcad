SELECT
  r.source_id, r.target_id, r.direction, r.viewed_from, r.mode, r.status,
  s.missing AS source_missing, t.missing AS target_missing,
  (SELECT json_group_array(json_object('sketchId', sketch_id, 'missing', missing))
   FROM cad_sketch_owner WHERE object_id = s.object_id) AS source_owners,
  (SELECT json_group_array(json_object('sketchId', sketch_id, 'missing', missing))
   FROM cad_sketch_owner WHERE object_id = t.object_id) AS target_owners
FROM cad_relation AS r
JOIN cad_object AS s ON s.object_id = r.source_id
JOIN cad_object AS t ON t.object_id = r.target_id
ORDER BY r.source_id, r.target_id;
