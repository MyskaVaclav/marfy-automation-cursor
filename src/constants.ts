/** Element ID to base name mapping (from spec). */
export const ID_TO_NAME: Record<number, string> = {
  23757: "cell_voltage_min_v",
  23758: "cell_voltage_max_v",
  23759: "cell_temp_min_c",
  23760: "cell_temp_max_c",
  23761: "module_voltage_min_v",
  23762: "module_voltage_max_v",
  23763: "module_temp_max_c",
  23764: "module_temp_min_c",
  23765: "soc_pct",
  23766: "soe_kwh",
  23767: "dc_voltage_v",
  23768: "dc_current_a",
  23769: "cell_id_max_temp",
  23770: "cell_id_min_temp",
  23771: "module_id_max_temp",
  23772: "module_id_min_temp",
  23773: "cell_id_max_voltage",
  23774: "cell_id_min_voltage",
  23775: "module_id_max_voltage",
  23776: "module_id_min_voltage",
};

/** Columns to upsert (same order as spec). */
export const SHEET_COLUMNS = [
  "time",
  "soc_pct_avg",
  "dc_current_a_avg",
  "dc_voltage_v_avg",
  "module_temp_max_c_avg",
  "module_temp_min_c_avg",
  "cell_id_max_voltage_avg",
  "cell_id_min_voltage_avg",
  "cell_id_max_temp_avg",
  "cell_id_min_temp_avg",
  "module_id_max_voltage_avg",
  "module_id_min_voltage_avg",
  "module_id_max_temp_avg",
  "module_id_min_temp_avg",
  "cell_voltage_min_v_avg",
  "cell_voltage_max_v_avg",
  "cell_temp_min_c_avg",
  "cell_temp_max_c_avg",
  "module_voltage_min_v_avg",
  "module_voltage_max_v_avg",
] as const;

export const LOGIN_URL = "https://marfy.ecmsystem.cz/Identity/Account/Login";
export const VIZ_URL = "https://marfy.ecmsystem.cz/?sectionID=4&nodeID=6557";
export const CHART_DATA_URL = "https://marfy.ecmsystem.cz/DynamicWeb/GetChartData";

export const BROWSER_HEADERS: Record<string, string> = {
  accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
  "accept-language": "en-GB,en-US;q=0.9,en;q=0.8,cs;q=0.7,de;q=0.6,sk;q=0.5",
  "cache-control": "max-age=0",
  origin: "https://marfy.ecmsystem.cz",
  priority: "u=0, i",
  referer: "https://marfy.ecmsystem.cz/Identity/Account/Login",
  "sec-ch-ua": '"Google Chrome";v="143", "Chromium";v="143", "Not A(Brand";v="24"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"Windows"',
  "sec-fetch-dest": "document",
  "sec-fetch-mode": "navigate",
  "sec-fetch-site": "same-origin",
  "sec-fetch-user": "?1",
  "upgrade-insecure-requests": "1",
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
};

/** Compliance limits. */
export const LIMITS = {
  cellTemp: { min: 0, max: 50, unit: "°C" },
  modTemp: { min: 0, max: 50, unit: "°C" },
  soc: { min: 8, max: 98, unit: "%" },
  cellVolt: { min: 3, max: 3.6, unit: "V" },
  cellTempSpreadMax: 5,
  modTempSpreadMax: 5,
  moduleVoltSpreadMax: 0.3,
  cellVoltSpreadMax: 0.03,
} as const;
