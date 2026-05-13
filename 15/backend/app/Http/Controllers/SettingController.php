<?php

namespace App\Http\Controllers;

use App\Models\Setting;
use Illuminate\Http\Request;

class SettingController extends Controller
{
    public function getTheme()
    {
        $setting = Setting::where('key', 'theme')->first();
        $defaultTheme = [
            'logo' => null,
            'primary_color' => '#3B82F6',
            'secondary_color' => '#1E40AF',
            'background_color' => '#F3F4F6',
            'header_color' => '#1F2937',
            'footer_text' => '© 2024 Status Page',
            'custom_html' => null,
            'site_name' => 'Status Page',
        ];

        $theme = $setting ? array_merge($defaultTheme, $setting->value) : $defaultTheme;

        return response()->json(['theme' => $theme]);
    }

    public function updateTheme(Request $request)
    {
        $validated = $request->validate([
            'logo' => 'nullable|string',
            'primary_color' => 'nullable|string',
            'secondary_color' => 'nullable|string',
            'background_color' => 'nullable|string',
            'header_color' => 'nullable|string',
            'footer_text' => 'nullable|string',
            'custom_html' => 'nullable|string',
            'site_name' => 'nullable|string',
        ]);

        $setting = Setting::updateOrCreate(
            ['key' => 'theme'],
            ['value' => $validated]
        );

        return response()->json(['theme' => $setting->value]);
    }

    public function getSettings()
    {
        $settings = Setting::all();
        $result = [];
        foreach ($settings as $setting) {
            $result[$setting->key] = $setting->value;
        }

        return response()->json(['settings' => $result]);
    }
}
