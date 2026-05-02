UPDATE users SET avatar = replace(avatar, 'y%3D%2242%22', 'y%3D%2250%25%22');
UPDATE users SET reserved_alias_avatar = replace(reserved_alias_avatar, 'y%3D%2242%22', 'y%3D%2250%25%22');
UPDATE user_aliases SET avatar = replace(avatar, 'y%3D%2242%22', 'y%3D%2250%25%22');
