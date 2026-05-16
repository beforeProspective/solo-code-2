<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Carbon\Carbon;
use App\Models\ShortLink;
use App\Models\Click;
use Endroid\QrCode\QrCode;
use Endroid\QrCode\Writer\PngWriter;

class ShortLinkController extends Controller
{
    protected function generateShortCode()
    {
        $characters = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
        $code = '';
        
        do {
            $code = substr(str_shuffle($characters), 0, 6);
        } while (ShortLink::where('short_code', $code)->exists());
        
        return $code;
    }

    public function index(Request $request)
    {
        $userId = $request->auth->sub;
        $links = ShortLink::where('user_id', $userId)
            ->orderBy('created_at', 'desc')
            ->paginate(15);

        return response()->json($links);
    }

    public function show(Request $request, $id)
    {
        $userId = $request->auth->sub;
        $link = ShortLink::where('id', $id)->where('user_id', $userId)->firstOrFail();

        return response()->json($link);
    }

    public function store(Request $request)
    {
        $this->validate($request, [
            'original_url' => 'required|url|max:2048',
            'custom_code' => 'nullable|string|max:32|unique:short_links,short_code',
            'custom_domain' => 'nullable|string|max:255',
            'password' => 'nullable|string|min:4',
            'expires_at' => 'nullable|date',
        ]);

        $shortCode = $request->custom_code ?: $this->generateShortCode();

        $link = ShortLink::create([
            'user_id' => $request->auth->sub,
            'original_url' => $request->original_url,
            'short_code' => $shortCode,
            'custom_domain' => $request->custom_domain,
            'password' => $request->password ? Hash::make($request->password) : null,
            'expires_at' => $request->expires_at,
        ]);

        return response()->json([
            'message' => 'Short link created successfully',
            'link' => $link,
            'short_url' => $link->short_url,
        ], 201);
    }

    public function createPublic(Request $request)
    {
        $this->validate($request, [
            'original_url' => 'required|url|max:2048',
        ]);

        $shortCode = $this->generateShortCode();

        $link = ShortLink::create([
            'user_id' => null,
            'original_url' => $request->original_url,
            'short_code' => $shortCode,
        ]);

        return response()->json([
            'message' => 'Short link created successfully',
            'link' => $link,
            'short_url' => $link->short_url,
        ], 201);
    }

    public function update(Request $request, $id)
    {
        $userId = $request->auth->sub;
        $link = ShortLink::where('id', $id)->where('user_id', $userId)->firstOrFail();

        $this->validate($request, [
            'original_url' => 'sometimes|url|max:2048',
            'custom_code' => 'sometimes|string|max:32|unique:short_links,short_code,' . $id,
            'custom_domain' => 'nullable|string|max:255',
            'password' => 'nullable|string|min:4',
            'expires_at' => 'nullable|date',
            'active' => 'sometimes|boolean',
        ]);

        $data = $request->only(['original_url', 'custom_domain', 'expires_at', 'active']);

        if ($request->has('custom_code') && $request->custom_code !== $link->short_code) {
            $data['short_code'] = $request->custom_code;
        }

        if ($request->has('password')) {
            $data['password'] = Hash::make($request->password);
        }

        $link->update($data);

        return response()->json([
            'message' => 'Short link updated successfully',
            'link' => $link,
        ]);
    }

    public function destroy(Request $request, $id)
    {
        $userId = $request->auth->sub;
        $link = ShortLink::where('id', $id)->where('user_id', $userId)->firstOrFail();

        $link->delete();

        return response()->json([
            'message' => 'Short link deleted successfully',
        ]);
    }

    public function toggle(Request $request, $id)
    {
        $userId = $request->auth->sub;
        $link = ShortLink::where('id', $id)->where('user_id', $userId)->firstOrFail();

        $link->active = !$link->active;
        $link->save();

        return response()->json([
            'message' => 'Short link status updated',
            'link' => $link,
        ]);
    }

    public function stats(Request $request, $id)
    {
        $userId = $request->auth->sub;
        $link = ShortLink::where('id', $id)->where('user_id', $userId)->firstOrFail();

        $clicks = Click::where('short_link_id', $link->id);

        $totalClicks = $clicks->count();
        
        $clicksLast7Days = $clicks->where('created_at', '>=', Carbon::now()->subDays(7))->count();
        $clicksLast30Days = $clicks->where('created_at', '>=', Carbon::now()->subDays(30))->count();

        $dailyClicks = Click::where('short_link_id', $link->id)
            ->selectRaw('DATE(created_at) as date, COUNT(*) as count')
            ->where('created_at', '>=', Carbon::now()->subDays(30))
            ->groupBy('date')
            ->orderBy('date')
            ->get();

        $referrers = Click::where('short_link_id', $link->id)
            ->selectRaw('IFNULL(referer, "direct") as referer, COUNT(*) as count')
            ->groupBy('referer')
            ->orderBy('count', 'desc')
            ->limit(10)
            ->get();

        $countries = Click::where('short_link_id', $link->id)
            ->selectRaw('IFNULL(country, "unknown") as country, COUNT(*) as count')
            ->groupBy('country')
            ->orderBy('count', 'desc')
            ->limit(10)
            ->get();

        return response()->json([
            'link' => $link,
            'total_clicks' => $totalClicks,
            'clicks_last_7_days' => $clicksLast7Days,
            'clicks_last_30_days' => $clicksLast30Days,
            'daily_clicks' => $dailyClicks,
            'referrers' => $referrers,
            'countries' => $countries,
        ]);
    }

    public function qrcode(Request $request, $id)
    {
        $userId = $request->auth->sub;
        $link = ShortLink::where('id', $id)->where('user_id', $userId)->firstOrFail();

        $qrCode = QrCode::create($link->short_url)
            ->setSize(300)
            ->setMargin(10);

        $writer = new PngWriter();
        $result = $writer->write($qrCode);

        return response($result->getString(), 200)
            ->header('Content-Type', 'image/png');
    }

    public function redirect(Request $request, $shortCode)
    {
        $link = ShortLink::where('short_code', $shortCode)->first();

        if (!$link) {
            return response()->json(['error' => 'Short link not found'], 404);
        }

        if (!$link->active) {
            return response()->json(['error' => 'Short link is disabled'], 403);
        }

        if ($link->isExpired()) {
            return response()->json(['error' => 'Short link has expired'], 410);
        }

        if ($link->hasPassword()) {
            $password = $request->query('password') ?: $request->header('X-Link-Password');
            if (!$password || !$link->verifyPassword($password)) {
                return response()->json(['error' => 'Password required'], 401);
            }
        }

        $link->increment('clicks');

        Click::create([
            'short_link_id' => $link->id,
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
            'referer' => $request->header('referer'),
        ]);

        return redirect($link->original_url, 302);
    }
}
