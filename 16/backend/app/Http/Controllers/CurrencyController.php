<?php

namespace App\Http\Controllers;

use App\Models\Currency;
use Illuminate\Http\Request;

class CurrencyController extends Controller
{
    public function index()
    {
        return response()->json(Currency::where('is_active', true)->get());
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'code' => 'required|string|max:3|unique:currencies',
            'name' => 'required|string|max:255',
            'symbol' => 'required|string|max:10',
            'rate_to_usd' => 'required|numeric',
        ]);

        $currency = Currency::create($validated);
        return response()->json($currency, 201);
    }

    public function show(Currency $currency)
    {
        return response()->json($currency);
    }

    public function update(Request $request, Currency $currency)
    {
        $validated = $request->validate([
            'name' => 'sometimes|string|max:255',
            'symbol' => 'sometimes|string|max:10',
            'rate_to_usd' => 'sometimes|numeric',
            'is_active' => 'sometimes|boolean',
        ]);

        $currency->update($validated);
        return response()->json($currency);
    }

    public function convert(Request $request)
    {
        $validated = $request->validate([
            'amount' => 'required|numeric',
            'from' => 'required|string|max:3',
            'to' => 'required|string|max:3',
        ]);

        $fromRate = Currency::where('code', $validated['from'])->value('rate_to_usd');
        $toRate = Currency::where('code', $validated['to'])->value('rate_to_usd');

        if (!$fromRate || !$toRate) {
            return response()->json(['error' => 'Currency not found'], 404);
        }

        $amountInUsd = $validated['amount'] / $fromRate;
        $convertedAmount = $amountInUsd * $toRate;

        return response()->json([
            'amount' => $validated['amount'],
            'from' => $validated['from'],
            'to' => $validated['to'],
            'rate' => $toRate / $fromRate,
            'converted_amount' => round($convertedAmount, 2),
        ]);
    }

    public function updateRates(Request $request)
    {
        $rates = [
            'USD' => 1.000000,
            'CNY' => 7.240000,
            'EUR' => 0.920000,
            'GBP' => 0.790000,
            'JPY' => 155.000000,
            'KRW' => 1360.000000,
            'HKD' => 7.820000,
            'SGD' => 1.340000,
        ];

        foreach ($rates as $code => $rate) {
            Currency::updateOrCreate(
                ['code' => $code],
                ['rate_to_usd' => $rate]
            );
        }

        $defaultCurrencies = [
            ['code' => 'CNY', 'name' => '人民币', 'symbol' => '¥'],
            ['code' => 'USD', 'name' => '美元', 'symbol' => '$'],
            ['code' => 'EUR', 'name' => '欧元', 'symbol' => '€'],
            ['code' => 'GBP', 'name' => '英镑', 'symbol' => '£'],
            ['code' => 'JPY', 'name' => '日元', 'symbol' => '¥'],
            ['code' => 'KRW', 'name' => '韩元', 'symbol' => '₩'],
            ['code' => 'HKD', 'name' => '港币', 'symbol' => 'HK$'],
            ['code' => 'SGD', 'name' => '新加坡元', 'symbol' => 'S$'],
        ];

        foreach ($defaultCurrencies as $currency) {
            Currency::where('code', $currency['code'])->update([
                'name' => $currency['name'],
                'symbol' => $currency['symbol'],
            ]);
        }

        return response()->json(['message' => 'Currency rates updated']);
    }
}
