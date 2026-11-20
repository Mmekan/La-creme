-- R3.1 seed: today's hardcoded menu prices, so GET /api/prices changes
-- nothing on day one. Requires schema-bot.sql (it creates the table).
--
-- INSERT OR IGNORE, so re-running never overwrites a price the owner has
-- since changed with /updateprice; delete a row to re-seed it.
--
-- Labels are matched word-for-word against the invoice line description
-- (R3.4d), so a label must not carry words the site never prints. The
-- unit ("per portion") lives in the menu, not in the label.
--
-- Key format (spec 5.3): '<item id>:<size>' for soups, '<item id>:<type>-
-- <style>' for rice (rice price varies on two dimensions, so both are in
-- the key), '<item id>' for proteins and finger foods.
INSERT OR IGNORE INTO product_prices (item_key, category, label, price, updated_at) VALUES
  ('afang:5L',              'soups',        'Afang Soup - 5L',                  30000, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('afang:10L',             'soups',        'Afang Soup - 10L',                 60000, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('edikang-ikong:5L',      'soups',        'Edikang Ikong - 5L',               30000, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('edikang-ikong:10L',     'soups',        'Edikang Ikong - 10L',              60000, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('atama:5L',              'soups',        'Atama Soup - 5L',                  28000, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('atama:10L',             'soups',        'Atama Soup - 10L',                 56000, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('white-soup:5L',         'soups',        'White Soup - 5L',                  28000, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('white-soup:10L',        'soups',        'White Soup - 10L',                 56000, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('egusi:5L',              'soups',        'Egusi Soup - 5L',                  28000, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('egusi:10L',             'soups',        'Egusi Soup - 10L',                 56000, strftime('%Y-%m-%dT%H:%M:%fZ','now')),

  ('jollof:Lunchpack-Standard',     'rice', 'Jollof Rice - Lunchpack (Standard)',  3500, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('jollof:Lunchpack-Classic',      'rice', 'Jollof Rice - Lunchpack (Classic)',   4500, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('jollof:Tray-Standard',          'rice', 'Jollof Rice - Tray (Standard)',      20000, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('jollof:Tray-Classic',           'rice', 'Jollof Rice - Tray (Classic)',       24000, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('fried-rice:Lunchpack-Standard', 'rice', 'Fried Rice - Lunchpack (Standard)',   3500, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('fried-rice:Lunchpack-Classic',  'rice', 'Fried Rice - Lunchpack (Classic)',    4500, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('fried-rice:Tray-Standard',      'rice', 'Fried Rice - Tray (Standard)',       20000, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('fried-rice:Tray-Classic',       'rice', 'Fried Rice - Tray (Classic)',        24000, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('coconut-rice:Lunchpack-Standard','rice','Coconut Rice - Lunchpack (Standard)',  3500, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('coconut-rice:Lunchpack-Classic', 'rice','Coconut Rice - Lunchpack (Classic)',   4500, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('coconut-rice:Tray-Standard',     'rice','Coconut Rice - Tray (Standard)',      20000, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('coconut-rice:Tray-Classic',      'rice','Coconut Rice - Tray (Classic)',       24000, strftime('%Y-%m-%dT%H:%M:%fZ','now')),

  ('chicken',               'catering',     'Chicken',             2500, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('turkey',                'catering',     'Turkey',              3000, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('beef',                  'catering',     'Beef',                2200, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('fish',                  'catering',     'Fish (Titus/Croaker)', 3200, strftime('%Y-%m-%dT%H:%M:%fZ','now')),

  ('sc-plate-standard',     'finger-foods', 'Small Chops - Plate (Standard)',    2500, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('sc-plate-classic',      'finger-foods', 'Small Chops - Plate (Classic)',     4000, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('sc-tray-standard',      'finger-foods', 'Small Chops - Tray (Standard)',    13000, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('sc-tray-classic',       'finger-foods', 'Small Chops - Tray (Classic)',     25000, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('cc-standard',           'finger-foods', 'Chin Chin - Standard Pack',        2000, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('cc-bucket',             'finger-foods', 'Chin Chin - Bucket',              15000, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('meat-pie',              'finger-foods', 'Meat Pie',                         1000, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('cake-slices',           'finger-foods', 'Cake Slices',                      3500, strftime('%Y-%m-%dT%H:%M:%fZ','now'));
