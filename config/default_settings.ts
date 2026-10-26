import { app } from 'electron';

const default_settings = {
  language: app?.getLocale ? app.getLocale() : 'en',
  prerelease_features: true,
  updates_automatic: true,

  show_setup: true,

  theme_mode: 'light',
  theme_direction: 'ltr',
  theme_contrast: 'default',
  theme_layout: 'vertical',
  theme_color_presets: 'default',
  theme_stretch: false,

  https_proxy: '',
  http_proxy: '',

  hub_content_types_endpoint: 'https://api.h5p.org/v1/content-types/',
  hub_registration_endpoint: 'https://api.h5p.org/v1/sites',
  ai: {
    provider: 'ollama',
    ollama_endpoint: 'http://localhost:11434',
    ollama_model: 'llama3.2:latest'
  }
};

export default default_settings;
