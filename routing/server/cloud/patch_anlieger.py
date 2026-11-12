#!/usr/bin/env python3
# Anlieger frei und nur für Gäste stark abwerten (Datenprüfung 12.11., Punkt 7). Idempotent.
import json
p = '/opt/cumo-routing/custom_models/sportwagen.json'
m = json.load(open(p)); pr = m['priority']
if not any('road_access' in x.get('if', '') for x in pr):
    i = next((k for k, x in enumerate(pr) if 'car_access' in x.get('if', '')), -1)
    pr.insert(i + 1, {"if": "road_access == DESTINATION || road_access == CUSTOMERS", "multiply_by": "0.1"})
    json.dump(m, open(p, 'w'), ensure_ascii=False, indent=2); open(p, 'a').write('\n')
    print('eingefügt an', i + 1)
else:
    print('schon drin')
