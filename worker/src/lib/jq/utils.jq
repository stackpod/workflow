def trim: if type == "string" then (sub("^[[:space:]]+"; "") | sub("[[:space:]]+$"; "")) else . end;

def trim_all_keys: walk( if type == "object" then with_entries( .key |= trim ) else . end );

def trim_all_values: walk( if type == "object" then with_entries( .value |= trim ) else . end );

def map_keys(f): if type == "object" then with_entries( .key |= f ) else . end;

# https://stackoverflow.com/a/72625380/172854
def exceptions: [""];
def capitalize:
  INDEX( exceptions[]; .) as $e
  | [splits("\\b") | select(length>0)]
  | map(if $e[.] then . else (.[:1]|ascii_upcase) + (.[1:] |ascii_downcase) end)
  | join("");

def urlparams: to_entries | map(.key + "=" + (.value | @uri)) | join("&");

