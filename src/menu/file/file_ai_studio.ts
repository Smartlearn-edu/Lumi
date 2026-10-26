import { BrowserWindow } from 'electron';
import { Context } from '../../boot';
import MenuItem from '../../types/MenuItem';
import { show_content_menu } from '..';

export default function file_ai_studio(ctx: Context): MenuItem {
  return {
    label: ctx.translate('AI Studio...'),
    accelerator: 'CmdOrCtrl+Shift+A',
    click: async () => {
      const port = ctx.is_development ? 8000 : ctx.port;
      const win = new BrowserWindow({
        width: 1200,
        height: 800,
        title: 'Lumi AI Studio',
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true
        }
      });

      win.on('focus', () => {
        show_content_menu(ctx);
      });

      win.loadURL(`http://localhost:${port}/ai-studio`);
    }
  };
}
