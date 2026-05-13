<?php

namespace App\Http\Controllers;

use App\Models\Account;
use App\Models\Transaction;
use App\Models\Rule;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class TransactionController extends Controller
{
    public function index(Request $request)
    {
        $query = Auth::user()->transactions()
            ->with(['account', 'category', 'tags'])
            ->orderBy('transaction_date', 'desc');

        if ($request->has('account_id')) {
            $query->where('account_id', $request->account_id);
        }
        if ($request->has('type')) {
            $query->where('type', $request->type);
        }
        if ($request->has('category_id')) {
            $query->where('category_id', $request->category_id);
        }
        if ($request->has('start_date')) {
            $query->where('transaction_date', '>=', $request->start_date);
        }
        if ($request->has('end_date')) {
            $query->where('transaction_date', '<=', $request->end_date);
        }

        $perPage = $request->get('per_page', 20);
        return response()->json($query->paginate($perPage));
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'account_id' => 'required|exists:accounts,id',
            'category_id' => 'nullable|exists:categories,id',
            'transfer_to_account_id' => 'nullable|exists:accounts,id',
            'type' => 'required|string',
            'amount' => 'required|numeric|min:0',
            'currency' => 'required|string|max:3',
            'description' => 'nullable|string',
            'transaction_date' => 'required|date',
            'is_recurring' => 'boolean',
            'recurring_interval' => 'nullable|string',
            'notes' => 'nullable|string',
            'tag_ids' => 'nullable|array',
        ]);

        $account = Account::find($validated['account_id']);
        if ($account->user_id !== Auth::id()) {
            abort(403);
        }

        $validated['user_id'] = Auth::id();
        $validated['amount_in_usd'] = $this->convertToUsd($validated['amount'], $validated['currency']);

        if (!$validated['category_id'] && $validated['type'] !== 'transfer') {
            $ruleMatch = $this->applyRules($validated);
            if ($ruleMatch) {
                $validated['category_id'] = $ruleMatch['category_id'];
                if (!isset($validated['tag_ids'])) {
                    $validated['tag_ids'] = $ruleMatch['tag_ids'];
                }
            }
        }

        $tagIds = $validated['tag_ids'] ?? [];
        unset($validated['tag_ids']);

        $transaction = Transaction::create($validated);

        if (!empty($tagIds)) {
            $transaction->tags()->sync($tagIds);
        }

        $this->updateAccountBalance($transaction);

        $transaction->load(['account', 'category', 'tags']);
        return response()->json($transaction, 201);
    }

    public function show(Transaction $transaction)
    {
        if ($transaction->user_id !== Auth::id()) {
            abort(403);
        }
        $transaction->load(['account', 'category', 'tags']);
        return response()->json($transaction);
    }

    public function update(Request $request, Transaction $transaction)
    {
        if ($transaction->user_id !== Auth::id()) {
            abort(403);
        }

        $this->revertAccountBalance($transaction);

        $validated = $request->validate([
            'account_id' => 'sometimes|exists:accounts,id',
            'category_id' => 'nullable|exists:categories,id',
            'transfer_to_account_id' => 'nullable|exists:accounts,id',
            'type' => 'sometimes|string',
            'amount' => 'sometimes|numeric|min:0',
            'currency' => 'sometimes|string|max:3',
            'description' => 'nullable|string',
            'transaction_date' => 'sometimes|date',
            'is_recurring' => 'boolean',
            'recurring_interval' => 'nullable|string',
            'notes' => 'nullable|string',
            'tag_ids' => 'nullable|array',
        ]);

        if (isset($validated['amount']) && isset($validated['currency'])) {
            $validated['amount_in_usd'] = $this->convertToUsd($validated['amount'], $validated['currency']);
        }

        $tagIds = $validated['tag_ids'] ?? null;
        unset($validated['tag_ids']);

        $transaction->update($validated);

        if ($tagIds !== null) {
            $transaction->tags()->sync($tagIds);
        }

        $this->updateAccountBalance($transaction);

        $transaction->load(['account', 'category', 'tags']);
        return response()->json($transaction);
    }

    public function destroy(Transaction $transaction)
    {
        if ($transaction->user_id !== Auth::id()) {
            abort(403);
        }

        $this->revertAccountBalance($transaction);
        $transaction->delete();
        return response()->json(['message' => 'Transaction deleted']);
    }

    protected function updateAccountBalance(Transaction $transaction)
    {
        $account = $transaction->account;
        if (!$account) return;

        if ($transaction->type === 'income') {
            $account->increment('balance', $transaction->amount);
        } elseif ($transaction->type === 'expense') {
            $account->decrement('balance', $transaction->amount);
        } elseif ($transaction->type === 'transfer') {
            $account->decrement('balance', $transaction->amount);
            if ($transaction->transfer_to_account_id) {
                $toAccount = Account::find($transaction->transfer_to_account_id);
                if ($toAccount) {
                    $toAccount->increment('balance', $transaction->amount);
                }
            }
        }
    }

    protected function revertAccountBalance(Transaction $transaction)
    {
        $account = $transaction->account;
        if (!$account) return;

        if ($transaction->type === 'income') {
            $account->decrement('balance', $transaction->amount);
        } elseif ($transaction->type === 'expense') {
            $account->increment('balance', $transaction->amount);
        } elseif ($transaction->type === 'transfer') {
            $account->increment('balance', $transaction->amount);
            if ($transaction->transfer_to_account_id) {
                $toAccount = Account::find($transaction->transfer_to_account_id);
                if ($toAccount) {
                    $toAccount->decrement('balance', $transaction->amount);
                }
            }
        }
    }

    protected function applyRules($data)
    {
        $rules = Auth::user()->rules()
            ->where('is_active', true)
            ->orderBy('priority', 'desc')
            ->get();

        foreach ($rules as $rule) {
            $matches = true;

            if ($rule->description_contains && isset($data['description'])) {
                if (stripos($data['description'], $rule->description_contains) === false) {
                    $matches = false;
                }
            }

            if ($rule->min_amount && $data['amount'] < $rule->min_amount) {
                $matches = false;
            }

            if ($rule->max_amount && $data['amount'] > $rule->max_amount) {
                $matches = false;
            }

            if ($matches) {
                return [
                    'category_id' => $rule->category_id,
                    'tag_ids' => $rule->tag_ids,
                ];
            }
        }

        return null;
    }

    protected function convertToUsd($amount, $currency)
    {
        if ($currency === 'USD') {
            return $amount;
        }

        $rate = \App\Models\Currency::where('code', $currency)->value('rate_to_usd');
        if (!$rate) {
            return $amount;
        }

        return $amount / $rate;
    }
}
