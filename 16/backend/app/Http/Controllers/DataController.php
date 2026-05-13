<?php

namespace App\Http\Controllers;

use App\Models\Account;
use App\Models\Category;
use App\Models\Tag;
use App\Models\Transaction;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

class DataController extends Controller
{
    public function export(Request $request)
    {
        $user = Auth::user();
        $format = $request->get('format', 'json');

        $accounts = $user->accounts()->get();
        $categories = $user->categories()->get();
        $tags = $user->tags()->get();
        $transactions = $user->transactions()->with(['tags', 'category', 'account'])->get();
        $budgets = $user->budgets()->with('category')->get();
        $bills = $user->bills()->get();
        $rules = $user->rules()->get();

        $data = [
            'exported_at' => now()->toISOString(),
            'version' => '1.0',
            'accounts' => $accounts,
            'categories' => $categories,
            'tags' => $tags,
            'transactions' => $transactions,
            'budgets' => $budgets,
            'bills' => $bills,
            'rules' => $rules,
        ];

        if ($format === 'csv') {
            return $this->exportCsv($transactions);
        }

        return response()->json($data)
            ->header('Content-Disposition', 'attachment; filename="finance-export.json"');
    }

    protected function exportCsv($transactions)
    {
        $headers = [
            'Content-type' => 'text/csv',
            'Content-Disposition' => 'attachment; filename="transactions.csv"',
        ];

        $columns = ['id', 'date', 'type', 'amount', 'currency', 'description', 'category', 'account', 'tags', 'notes'];

        $callback = function() use ($transactions, $columns) {
            $file = fopen('php://output', 'w');
            fputcsv($file, $columns);

            foreach ($transactions as $transaction) {
                $row = [
                    $transaction->id,
                    $transaction->transaction_date,
                    $transaction->type,
                    $transaction->amount,
                    $transaction->currency,
                    $transaction->description,
                    $transaction->category->name ?? '',
                    $transaction->account->name ?? '',
                    $transaction->tags->pluck('name')->implode('; '),
                    $transaction->notes,
                ];
                fputcsv($file, $row);
            }
            fclose($file);
        };

        return response()->stream($callback, 200, $headers);
    }

    public function import(Request $request)
    {
        $request->validate([
            'file' => 'required|file|mimes:csv,json',
        ]);

        $file = $request->file('file');
        $extension = $file->getClientOriginalExtension();

        if ($extension === 'json') {
            return $this->importJson($file);
        } else {
            return $this->importCsv($file);
        }
    }

    protected function importJson($file)
    {
        $data = json_decode(file_get_contents($file->getRealPath()), true);
        $importedCount = 0;

        if (isset($data['transactions'])) {
            foreach ($data['transactions'] as $transactionData) {
                $this->importTransaction($transactionData);
                $importedCount++;
            }
        }

        if (isset($data['accounts'])) {
            foreach ($data['accounts'] as $accountData) {
                Account::updateOrCreate(
                    ['user_id' => Auth::id(), 'name' => $accountData['name']],
                    $accountData
                );
            }
        }

        if (isset($data['categories'])) {
            foreach ($data['categories'] as $categoryData) {
                Category::updateOrCreate(
                    ['user_id' => Auth::id(), 'name' => $categoryData['name']],
                    $categoryData
                );
            }
        }

        if (isset($data['tags'])) {
            foreach ($data['tags'] as $tagData) {
                Tag::updateOrCreate(
                    ['user_id' => Auth::id(), 'name' => $tagData['name']],
                    $tagData
                );
            }
        }

        return response()->json([
            'message' => 'Import completed',
            'imported_count' => $importedCount,
        ]);
    }

    protected function importCsv($file)
    {
        $file = fopen($file->getRealPath(), 'r');
        $headers = fgetcsv($file);
        $importedCount = 0;

        while (($row = fgetcsv($file)) !== false) {
            $data = array_combine($headers, $row);
            
            $this->importTransactionFromCsv($data);
            $importedCount++;
        }

        fclose($file);

        return response()->json([
            'message' => 'Import completed',
            'imported_count' => $importedCount,
        ]);
    }

    protected function importTransaction($data)
    {
        $account = $this->getOrCreateAccount($data['account_name'] ?? 'Default Account');
        $category = $this->getOrCreateCategory($data['category_name'] ?? null);

        $transactionData = [
            'user_id' => Auth::id(),
            'account_id' => $account->id,
            'category_id' => $category?->id,
            'type' => $data['type'] ?? 'expense',
            'amount' => $data['amount'],
            'currency' => $data['currency'] ?? 'CNY',
            'description' => $data['description'] ?? null,
            'transaction_date' => $data['transaction_date'] ?? now(),
            'notes' => $data['notes'] ?? null,
        ];

        $transaction = Transaction::create($transactionData);

        if (!empty($data['tags'])) {
            $tagIds = [];
            foreach ($data['tags'] as $tagName) {
                $tag = $this->getOrCreateTag($tagName);
                $tagIds[] = $tag->id;
            }
            $transaction->tags()->sync($tagIds);
        }
    }

    protected function importTransactionFromCsv($data)
    {
        $account = $this->getOrCreateAccount($data['account'] ?? 'Default Account');
        $category = $this->getOrCreateCategory($data['category'] ?? null);

        $transactionData = [
            'user_id' => Auth::id(),
            'account_id' => $account->id,
            'category_id' => $category?->id,
            'type' => $data['type'] ?? 'expense',
            'amount' => floatval($data['amount']),
            'currency' => $data['currency'] ?? 'CNY',
            'description' => $data['description'] ?? $data['desc'] ?? null,
            'transaction_date' => $data['date'] ?? $data['transaction_date'] ?? now(),
            'notes' => $data['notes'] ?? null,
        ];

        Transaction::create($transactionData);
    }

    protected function getOrCreateAccount($name)
    {
        return Account::firstOrCreate(
            ['user_id' => Auth::id(), 'name' => $name],
            [
                'type' => 'checking',
                'currency' => 'CNY',
                'balance' => 0,
            ]
        );
    }

    protected function getOrCreateCategory($name)
    {
        if (!$name) return null;

        return Category::firstOrCreate(
            ['user_id' => Auth::id(), 'name' => $name],
            [
                'type' => 'expense',
            ]
        );
    }

    protected function getOrCreateTag($name)
    {
        return Tag::firstOrCreate(
            ['user_id' => Auth::id(), 'name' => $name]
        );
    }
}
