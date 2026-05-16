<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Carbon\Carbon;
use App\Models\ShortLink;
use App\Models\Click;

class StatsController extends Controller
{
    public function overview(Request $request)
    {
        $userId = $request->auth->sub;

        $totalLinks = ShortLink::where('user_id', $userId)->count();
        $activeLinks = ShortLink::where('user_id', $userId)->where('active', true)->count();
        $totalClicks = Click::whereHas('shortLink', function ($query) use ($userId) {
            $query->where('user_id', $userId);
        })->count();

        $todayClicks = Click::whereHas('shortLink', function ($query) use ($userId) {
            $query->where('user_id', $userId);
        })->whereDate('created_at', Carbon::today())->count();

        $topLinks = ShortLink::where('user_id', $userId)
            ->orderBy('clicks', 'desc')
            ->limit(5)
            ->get();

        return response()->json([
            'total_links' => $totalLinks,
            'active_links' => $activeLinks,
            'total_clicks' => $totalClicks,
            'today_clicks' => $todayClicks,
            'top_links' => $topLinks,
        ]);
    }

    public function trends(Request $request)
    {
        $userId = $request->auth->sub;
        $days = $request->query('days', 30);

        $dailyStats = Click::selectRaw('DATE(clicks.created_at) as date, COUNT(*) as clicks, COUNT(DISTINCT short_link_id) as links')
            ->join('short_links', 'clicks.short_link_id', '=', 'short_links.id')
            ->where('short_links.user_id', $userId)
            ->where('clicks.created_at', '>=', Carbon::now()->subDays($days))
            ->groupBy('date')
            ->orderBy('date')
            ->get();

        return response()->json([
            'daily_stats' => $dailyStats,
            'period_days' => $days,
        ]);
    }

    public function referrers(Request $request)
    {
        $userId = $request->auth->sub;

        $referrers = Click::selectRaw('IFNULL(clicks.referer, "direct") as referer, COUNT(*) as count')
            ->join('short_links', 'clicks.short_link_id', '=', 'short_links.id')
            ->where('short_links.user_id', $userId)
            ->groupBy('referer')
            ->orderBy('count', 'desc')
            ->limit(20)
            ->get();

        $countries = Click::selectRaw('IFNULL(clicks.country, "unknown") as country, COUNT(*) as count')
            ->join('short_links', 'clicks.short_link_id', '=', 'short_links.id')
            ->where('short_links.user_id', $userId)
            ->groupBy('country')
            ->orderBy('count', 'desc')
            ->limit(20)
            ->get();

        return response()->json([
            'referrers' => $referrers,
            'countries' => $countries,
        ]);
    }
}
