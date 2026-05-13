<?php

namespace App\Http\Controllers;

use App\Models\Bill;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class BillController extends Controller
{
    public function index(Request $request)
    {
        $query = Auth::user()->bills()->with(['account', 'category']);

        if ($request->has('is_paid')) {
            $query->where('is_paid', filter_var($request->is_paid, FILTER_VALIDATE_BOOLEAN));
        }

        if ($request->has('due_date_from')) {
            $query->where('due_date', '>=', $request->due_date_from);
        }

        if ($request->has('due_date_to')) {
            $query->where('due_date', '<=', $request->due_date_to);
        }

        $bills = $query->orderBy('due_date', 'asc')->get();

        $upcoming = $bills->filter(function ($bill) {
            return !$bill->is_paid;
        })->values();

        $overdue = $upcoming->filter(function ($bill) {
            return $bill->due_date < now()->toDateString();
        })->values();

        return response()->json([
            'bills' => $bills,
            'upcoming' => $upcoming,
            'overdue' => $overdue,
            'upcoming_count' => $upcoming->count(),
            'overdue_count' => $overdue->count(),
        ]);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'account_id' => 'nullable|exists:accounts,id',
            'category_id' => 'nullable|exists:categories,id',
            'amount' => 'required|numeric|min:0',
            'currency' => 'nullable|string|max:3',
            'due_date' => 'required|date',
            'frequency' => 'required|string',
            'auto_reminder' => 'boolean',
            'notes' => 'nullable|string',
        ]);
        
        $validated['currency'] = $validated['currency'] ?? 'CNY';

        $validated['user_id'] = Auth::id();
        $bill = Bill::create($validated);
        $bill->load(['account', 'category']);
        return response()->json($bill, 201);
    }

    public function show(Bill $bill)
    {
        if ($bill->user_id !== Auth::id()) {
            abort(403);
        }
        $bill->load(['account', 'category']);
        return response()->json($bill);
    }

    public function update(Request $request, Bill $bill)
    {
        if ($bill->user_id !== Auth::id()) {
            abort(403);
        }

        $validated = $request->validate([
            'name' => 'sometimes|string|max:255',
            'account_id' => 'nullable|exists:accounts,id',
            'category_id' => 'nullable|exists:categories,id',
            'amount' => 'sometimes|numeric|min:0',
            'currency' => 'sometimes|string|max:3',
            'due_date' => 'sometimes|date',
            'frequency' => 'sometimes|string',
            'is_paid' => 'boolean',
            'paid_date' => 'nullable|date',
            'auto_reminder' => 'boolean',
            'notes' => 'nullable|string',
        ]);

        $bill->update($validated);
        $bill->load(['account', 'category']);
        return response()->json($bill);
    }

    public function markAsPaid(Bill $bill)
    {
        if ($bill->user_id !== Auth::id()) {
            abort(403);
        }

        $bill->update([
            'is_paid' => true,
            'paid_date' => now()->toDateString(),
        ]);

        $nextBill = $this->createNextBill($bill);

        $bill->load(['account', 'category']);
        return response()->json([
            'bill' => $bill,
            'next_bill' => $nextBill,
        ]);
    }

    public function destroy(Bill $bill)
    {
        if ($bill->user_id !== Auth::id()) {
            abort(403);
        }
        $bill->delete();
        return response()->json(['message' => 'Bill deleted']);
    }

    protected function createNextBill(Bill $bill)
    {
        $frequencies = [
            'weekly' => '+1 week',
            'biweekly' => '+2 weeks',
            'monthly' => '+1 month',
            'quarterly' => '+3 months',
            'yearly' => '+1 year',
        ];

        if (!isset($frequencies[$bill->frequency])) {
            return null;
        }

        $newDueDate = date('Y-m-d', strtotime($frequencies[$bill->frequency], strtotime($bill->due_date)));

        return Bill::create([
            'user_id' => $bill->user_id,
            'account_id' => $bill->account_id,
            'category_id' => $bill->category_id,
            'name' => $bill->name,
            'amount' => $bill->amount,
            'currency' => $bill->currency,
            'due_date' => $newDueDate,
            'frequency' => $bill->frequency,
            'is_paid' => false,
            'auto_reminder' => $bill->auto_reminder,
            'notes' => $bill->notes,
        ]);
    }
}
