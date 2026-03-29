-- Revert Microsoft Teams bridge (teams_channel_links). Safe if table was never created.
DROP TABLE IF EXISTS teams_channel_links;
