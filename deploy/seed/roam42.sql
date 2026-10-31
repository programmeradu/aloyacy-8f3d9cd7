DELETE FROM trip_group_members WHERE group_id='roam42-group';
DELETE FROM trip_groups WHERE code='ROAM42';
INSERT INTO trip_groups (id, code, destination_label, destination_lat, destination_lng, created_by_name, expires_at)
VALUES ('roam42-group','ROAM42','University of Cyprus',35.1458,33.4101,'Samuel',strftime('%Y-%m-%dT%H:%M:%fZ','now','+7 days'));
INSERT INTO trip_group_members (id, group_id, member_token, display_name, origin_label, last_lat, last_lng, last_updated, eta_minutes, status, is_creator) VALUES
('roam42-m1','roam42-group','roam42-tok-1','Samuel','Solomos Square',35.16955,33.36085,strftime('%Y-%m-%dT%H:%M:%fZ','now'),26,'active',1),
('roam42-m2','roam42-group','roam42-tok-2','Eleni','Strovolos',35.1490,33.3480,strftime('%Y-%m-%dT%H:%M:%fZ','now'),31,'active',0),
('roam42-m3','roam42-group','roam42-tok-3','Andreas','Aglantzia',35.1530,33.3960,strftime('%Y-%m-%dT%H:%M:%fZ','now'),12,'active',0);
UPDATE trip_group_members SET mode='bus' WHERE id='roam42-m1';
UPDATE trip_group_members SET mode='walk' WHERE id='roam42-m2';
UPDATE trip_group_members SET mode='bike' WHERE id='roam42-m3';
SELECT code, (SELECT count(*) FROM trip_group_members WHERE group_id='roam42-group') AS members FROM trip_groups WHERE code='ROAM42';
