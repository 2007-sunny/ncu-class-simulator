import pandas as pd
import json
import re

def clean_my_csv(file_path, semester="1141"):
    time_map = {
        '1': '08:00', '2': '09:00', '3': '10:00', '4': '11:00',
        'Z': '12:00', '5': '13:00', '6': '14:00', '7': '15:00',
        '8': '16:00', 'A': '17:00', 'B': '18:00', 'C': '19:00'
    }
    time_map_end = {
        '1': '08:50', '2': '09:50', '3': '10:50', '4': '11:50',
        'Z': '12:50', '5': '13:50', '6': '14:50', '7': '15:50',
        '8': '16:50', 'A': '17:50', 'B': '18:50', 'C': '19:50'
    }
    day_map = {'一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '日': 7}
    day_alias_map = {
        '一': '一', '二': '二', '三': '三', '四': '四', '五': '五', '六': '六', '日': '日',
        'Mon': '一', 'Tue': '二', 'Wed': '三', 'Thu': '四', 'Fri': '五', 'Sat': '六', 'Sun': '日'
    }
    day_pattern = '|'.join(sorted(map(re.escape, day_alias_map.keys()), key=len, reverse=True))

    def parse_time_part(time_part):
        match = re.match(rf'^({day_pattern})([0-9A-Za-z]+)$', time_part)
        if not match:
            return None, ""
        day = day_alias_map[match.group(1)]
        periods = match.group(2).upper()
        return day, periods

    try:
        df = pd.read_csv(file_path, skiprows=1, encoding="utf-8-sig").fillna("")
        col_id = [c for c in df.columns if '流水號' in str(c)][0]
        col_name = [c for c in df.columns if '課程名稱' in str(c)][0]
        col_teacher = [c for c in df.columns if '授課教師' in str(c)][0]
        col_credit = [c for c in df.columns if '學分' in str(c)][0]
        col_time_loc = [c for c in df.columns if '時間' in str(c)][0]

        cleaned_list = []
        for _, row in df.iterrows():
            if '學分' in str(row[col_credit]) or str(row[col_name]).strip() == "": continue

            raw_tl = str(row[col_time_loc]).replace('\n', ' ').strip()
            
            # 使用正規表達式擷取所有時間與地點配對
            pairs = re.findall(rf'(({day_pattern})[0-9A-Za-z]+)(?:/([^\s(]+))?', raw_tl)
            
            raw_times = []
            display_times = []
            locations = []
            sort_keys = []
            start_times = []
            
            if not pairs:
                time_part = raw_tl if raw_tl else "未定"
                raw_times.append(time_part)
                display_times.append(time_part)
                locations.append("未定")
                sort_keys.append(9999)
                detailed_desc = ""
            else:
                desc_match = re.search(r'(\(.*\))', raw_tl)
                detailed_desc = desc_match.group(1).strip() if desc_match else ""
                
                for time_part, _, loc_part in pairs:
                    loc = loc_part.strip() if loc_part else "未定"
                    locations.append(loc)
                    
                    day, periods = parse_time_part(time_part)
                    if day and periods:
                        normalized_time = f"{day}{periods}"
                        raw_times.append(normalized_time)
                        start_times_list = [time_map.get(p, p) for p in periods if p in time_map]
                        end_times_list = [time_map_end.get(p, p) for p in periods if p in time_map_end]
                        if start_times_list and end_times_list:
                            display_times.append(f"{day} ({start_times_list[0]}-{end_times_list[-1]})")
                            start_time = start_times_list[0]
                            start_times.append(start_time)
                            sort_keys.append(day_map.get(day, 8) * 100 + int(start_time.split(':')[0]))
                        else:
                            display_times.append(normalized_time)
                            sort_keys.append(9999)
                    else:
                        raw_times.append(time_part)
                        display_times.append(time_part)
                        sort_keys.append(9999)
                        
            display_time = "<br>".join(display_times)
            display_loc = "<br>".join(locations)
            if detailed_desc:
                display_loc += f" {detailed_desc}"
            sort_key = min(sort_keys) if sort_keys else 9999
            final_start_time = start_times[0] if start_times else ""

            try:
                credit_val = int(pd.to_numeric(str(row[col_credit]), errors='coerce'))
                if pd.isna(credit_val): credit_val = 0
            except: credit_val = 0

            cleaned_list.append({
                "id": str(row[col_id]).split('\n')[-1].strip(),
                "name": str(row[col_name]).split('\n')[0].strip(),
                "teacher": str(row[col_teacher]).strip(),
                "credit": credit_val,
                "time": display_time,
                "raw_time": raw_times, # 轉換為陣列供衝堂偵測使用
                "start_time": final_start_time,
                "sort_key": sort_key,
                "location": display_loc
            })

        # 這裡改用命名空間寫法
        js_output = f"""
window.NCU_COURSES = window.NCU_COURSES || {{}};
window.NCU_COURSES["{semester}"] = {json.dumps(cleaned_list, ensure_ascii=False, indent=4)};
"""
        output_filename = f"course_{semester}.js"
        with open(output_filename, "w", encoding="utf-8") as f:
            f.write(js_output)
            
        print(f"成功！已產出 {output_filename}，採用高擴充性命名架構。")

    except Exception as e: print(f"發生錯誤: {e}")

# 執行時可以指定學期
clean_my_csv("dd.csv", semester="1150")
