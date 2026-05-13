<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

class ReportController extends Controller
{
    public function summary(Request $request)
    {
        $period = $request->get('period', 'month');
        
        switch ($period) {
            case 'week':
                $startDate = now()->startOfWeek()->toDateString();
                $endDate = now()->endOfWeek()->toDateString();
                break;
            case 'year':
                $startDate = now()->startOfYear()->toDateString();
                $endDate = now()->endOfYear()->toDateString();
                break;
            case 'quarter':
                $startDate = now()->startOfQuarter()->toDateString();
                $endDate = now()->endOfQuarter()->toDateString();
                break;
            default:
                $startDate = $request->get('start_date', now()->startOfMonth()->toDateString());
                $endDate = $request->get('end_date', now()->endOfMonth()->toDateString());
        }

        $user = Auth::user();

        $income = $user->transactions()
            ->where('type', 'income')
            ->whereBetween('transaction_date', [$startDate, $endDate])
            ->sum('amount');

        $expense = $user->transactions()
            ->where('type', 'expense')
            ->whereBetween('transaction_date', [$startDate, $endDate])
            ->sum('amount');

        $totalAssets = $user->accounts()->sum('balance');

        $transactionCount = $user->transactions()
            ->whereBetween('transaction_date', [$startDate, $endDate])
            ->count();

        $topCategories = DB::table('transactions')
            ->join('categories', 'transactions.category_id', '=', 'categories.id')
            ->select(
                'categories.id',
                'categories.name',
                'categories.color',
                DB::raw('SUM(transactions.amount) as total'),
                DB::raw('COUNT(transactions.id) as count')
            )
            ->where('transactions.user_id', Auth::id())
            ->where('transactions.type', 'expense')
            ->whereBetween('transactions.transaction_date', [$startDate, $endDate])
            ->groupBy('categories.id', 'categories.name', 'categories.color')
            ->orderBy('total', 'desc')
            ->limit(10)
            ->get();

        return response()->json([
            'income' => (float) $income,
            'expense' => (float) $expense,
            'net' => (float) ($income - $expense),
            'total_assets' => (float) $totalAssets,
            'net_worth' => (float) $totalAssets,
            'transaction_count' => $transactionCount,
            'top_categories' => $topCategories,
            'start_date' => $startDate,
            'end_date' => $endDate,
        ]);
    }

    public function trend(Request $request)
    {
        $period = $request->get('period', 'month');
        
        switch ($period) {
            case 'week':
                $startDate = now()->startOfWeek()->toDateString();
                $endDate = now()->endOfWeek()->toDateString();
                $groupBy = 'day';
                break;
            case 'year':
                $startDate = now()->startOfYear()->toDateString();
                $endDate = now()->endOfYear()->toDateString();
                $groupBy = 'month';
                break;
            case 'quarter':
                $startDate = now()->startOfQuarter()->toDateString();
                $endDate = now()->endOfQuarter()->toDateString();
                $groupBy = 'month';
                break;
            default:
                $startDate = $request->get('start_date', now()->subMonths(6)->startOfMonth()->toDateString());
                $endDate = $request->get('end_date', now()->endOfMonth()->toDateString());
                $groupBy = $request->get('group_by', 'month');
        }

        $dateFormat = $groupBy === 'month' 
            ? '%Y-%m' 
            : ($groupBy === 'week' ? '%Y-%W' : '%Y-%m-%d');

        $trendData = DB::table('transactions')
            ->select(
                DB::raw("strftime('{$dateFormat}', transaction_date) as period"),
                DB::raw("SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) as income"),
                DB::raw("SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) as expense")
            )
            ->where('user_id', Auth::id())
            ->whereBetween('transaction_date', [$startDate, $endDate])
            ->groupBy('period')
            ->orderBy('period', 'asc')
            ->get();

        return response()->json($trendData);
    }

    public function byCategory(Request $request)
    {
        $period = $request->get('period', 'month');
        
        switch ($period) {
            case 'week':
                $startDate = now()->startOfWeek()->toDateString();
                $endDate = now()->endOfWeek()->toDateString();
                break;
            case 'year':
                $startDate = now()->startOfYear()->toDateString();
                $endDate = now()->endOfYear()->toDateString();
                break;
            case 'quarter':
                $startDate = now()->startOfQuarter()->toDateString();
                $endDate = now()->endOfQuarter()->toDateString();
                break;
            default:
                $startDate = $request->get('start_date', now()->startOfMonth()->toDateString());
                $endDate = $request->get('end_date', now()->endOfMonth()->toDateString());
        }
        
        $type = $request->get('type', 'expense');

        $data = DB::table('transactions')
            ->join('categories', 'transactions.category_id', '=', 'categories.id')
            ->select(
                'categories.id',
                'categories.name',
                'categories.color',
                DB::raw('SUM(transactions.amount) as total'),
                DB::raw('COUNT(transactions.id) as count')
            )
            ->where('transactions.user_id', Auth::id())
            ->where('transactions.type', $type)
            ->whereBetween('transactions.transaction_date', [$startDate, $endDate])
            ->groupBy('categories.id', 'categories.name', 'categories.color')
            ->orderBy('total', 'desc')
            ->get();

        return response()->json($data);
    }

    public function netWorth(Request $request)
    {
        $months = $request->get('months', 12);

        $data = [];
        $currentDate = now();

        for ($i = $months - 1; $i >= 0; $i--) {
            $date = $currentDate->copy()->subMonths($i)->endOfMonth();
            $period = $date->format('Y-m');

            $totalAssets = Auth::user()->accounts()->sum('balance');

            $monthlyIncome = Auth::user()->transactions()
                ->where('type', 'income')
                ->whereYear('transaction_date', $date->year)
                ->whereMonth('transaction_date', $date->month)
                ->sum('amount');

            $monthlyExpense = Auth::user()->transactions()
                ->where('type', 'expense')
                ->whereYear('transaction_date', $date->year)
                ->whereMonth('transaction_date', $date->month)
                ->sum('amount');

            $data[] = [
                'period' => $period,
                'net_worth' => (float) $totalAssets,
                'income' => (float) $monthlyIncome,
                'expense' => (float) $monthlyExpense,
            ];
        }

        return response()->json($data);
    }

    public function accountBalances()
    {
        $accounts = Auth::user()->accounts()->get();

        $data = $accounts->map(function ($account) {
            return [
                'id' => $account->id,
                'name' => $account->name,
                'type' => $account->type,
                'balance' => (float) $account->balance,
                'currency' => $account->currency,
                'color' => $account->color,
            ];
        });

        return response()->json($data);
    }
}
