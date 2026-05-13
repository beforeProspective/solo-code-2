<?php

namespace App\Http\Controllers;

use App\Models\Budget;
use App\Models\Transaction;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class BudgetController extends Controller
{
    public function index()
    {
        $budgets = Auth::user()->budgets()->with('category')->orderBy('created_at', 'desc')->get();
        
        $budgets = $budgets->map(function ($budget) {
            $spent = $this->getBudgetSpent($budget);
            $budget->spent = $spent;
            $budget->remaining = max(0, $budget->amount - $spent);
            $budget->percentage = $budget->amount > 0 ? min(100, ($spent / $budget->amount) * 100) : 0;
            return $budget;
        });

        return response()->json($budgets);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'category_id' => 'nullable|exists:categories,id',
            'amount' => 'required|numeric|min:0',
            'currency' => 'required|string|max:3',
            'period' => 'required|string',
            'year' => 'required|integer',
            'month' => 'nullable|integer',
            'notes' => 'nullable|string',
        ]);

        $validated['user_id'] = Auth::id();
        $budget = Budget::create($validated);
        $budget->load('category');
        return response()->json($budget, 201);
    }

    public function show(Budget $budget)
    {
        if ($budget->user_id !== Auth::id()) {
            abort(403);
        }
        $budget->load('category');
        
        $spent = $this->getBudgetSpent($budget);
        $budget->spent = $spent;
        $budget->remaining = max(0, $budget->amount - $spent);
        $budget->percentage = $budget->amount > 0 ? min(100, ($spent / $budget->amount) * 100) : 0;
        
        return response()->json($budget);
    }

    public function update(Request $request, Budget $budget)
    {
        if ($budget->user_id !== Auth::id()) {
            abort(403);
        }

        $validated = $request->validate([
            'name' => 'sometimes|string|max:255',
            'category_id' => 'nullable|exists:categories,id',
            'amount' => 'sometimes|numeric|min:0',
            'currency' => 'sometimes|string|max:3',
            'period' => 'sometimes|string',
            'year' => 'sometimes|integer',
            'month' => 'nullable|integer',
            'notes' => 'nullable|string',
        ]);

        $budget->update($validated);
        $budget->load('category');
        return response()->json($budget);
    }

    public function destroy(Budget $budget)
    {
        if ($budget->user_id !== Auth::id()) {
            abort(403);
        }
        $budget->delete();
        return response()->json(['message' => 'Budget deleted']);
    }

    protected function getBudgetSpent($budget)
    {
        $query = Auth::user()->transactions()
            ->where('type', 'expense');

        if ($budget->category_id) {
            $query->where('category_id', $budget->category_id);
        }

        if ($budget->period === 'monthly' && $budget->year && $budget->month) {
            $query->whereYear('transaction_date', $budget->year)
                  ->whereMonth('transaction_date', $budget->month);
        } elseif ($budget->period === 'yearly' && $budget->year) {
            $query->whereYear('transaction_date', $budget->year);
        }

        return (float) $query->sum('amount');
    }
}
