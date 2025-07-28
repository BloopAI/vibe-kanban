use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClaudeConfig {
    #[serde(rename = "primaryApiKey")]
    pub primary_api_key: Option<String>,
    // Add other config fields if needed
}

/// Read Anthropic API key from ~/.claude.json file (primaryApiKey field)
pub fn get_anthropic_api_key() -> Option<String> {
    // Try multiple sources in order of preference
    
    // 1. Environment variable (highest priority)
    if let Ok(key) = std::env::var("ANTHROPIC_API_KEY") {
        return Some(key);
    }
    
    // 2. Claude config file
    if let Some(key) = read_claude_config_api_key() {
        return Some(key);
    }
    
    // 3. Alternative environment variable
    if let Ok(key) = std::env::var("CLAUDE_API_KEY") {
        return Some(key);
    }
    
    None
}

fn read_claude_config_api_key() -> Option<String> {
    let home_dir = dirs::home_dir()?;
    let claude_config_path = home_dir.join(".claude.json");
    
    if !claude_config_path.exists() {
        return None;
    }
    
    let content = std::fs::read_to_string(&claude_config_path).ok()?;
    
    // Try to parse as Claude config format
    if let Ok(config) = serde_json::from_str::<ClaudeConfig>(&content) {
        return config.primary_api_key;
    }
    
    // Fallback: Try to find primaryApiKey or apiKey in raw JSON
    if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
        // Check for primaryApiKey at root level (preferred)
        if let Some(api_key) = json.get("primaryApiKey").and_then(|v| v.as_str()) {
            return Some(api_key.to_string());
        }
        
        // Check for apiKey at root level (fallback)
        if let Some(api_key) = json.get("apiKey").and_then(|v| v.as_str()) {
            return Some(api_key.to_string());
        }
        
        // Check for nested patterns that might exist
        if let Some(config_obj) = json.as_object() {
            for (_key, value) in config_obj {
                if let Some(api_key) = extract_api_key_from_value(value) {
                    return Some(api_key);
                }
            }
        }
    }
    
    None
}

fn extract_api_key_from_value(value: &serde_json::Value) -> Option<String> {
    match value {
        serde_json::Value::Object(obj) => {
            // Check for primaryApiKey in this object (preferred)
            if let Some(api_key) = obj.get("primaryApiKey").and_then(|v| v.as_str()) {
                return Some(api_key.to_string());
            }
            
            // Check for apiKey in this object (fallback)
            if let Some(api_key) = obj.get("apiKey").and_then(|v| v.as_str()) {
                return Some(api_key.to_string());
            }
            
            // Recursively check nested objects
            for (_key, nested_value) in obj {
                if let Some(api_key) = extract_api_key_from_value(nested_value) {
                    return Some(api_key);
                }
            }
        }
        _ => {}
    }
    None
}