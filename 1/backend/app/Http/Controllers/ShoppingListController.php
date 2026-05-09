<?php

namespace App\Http\Controllers;

use App\Models\ShoppingList;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;

class ShoppingListController extends Controller
{
    public function generate(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'week_start' => 'required|date',
            'week_end' => 'required|date|after:week_start',
        ]);

        $shoppingList = ShoppingList::generateForWeek(
            $validated['week_start'],
            $validated['week_end']
        );

        ShoppingList::whereBetween('week_start', [
            $validated['week_start'],
            $validated['week_end']
        ])->delete();

        foreach ($shoppingList as $item) {
            ShoppingList::create([
                'week_start' => $validated['week_start'],
                'week_end' => $validated['week_end'],
                'ingredient_id' => $item['ingredient_id'],
                'required_quantity' => $item['required_quantity'],
                'available_stock' => $item['available_stock'],
                'to_buy' => $item['to_buy'],
                'purchased' => false,
            ]);
        }

        return response()->json([
            'week_start' => $validated['week_start'],
            'week_end' => $validated['week_end'],
            'items' => $shoppingList,
        ]);
    }

    public function index(Request $request): JsonResponse
    {
        $query = ShoppingList::with('ingredient');

        if ($request->has('week_start') && $request->has('week_end')) {
            $query->whereBetween('week_start', [$request->week_start, $request->week_end]);
        }

        $lists = $query->get();
        return response()->json($lists);
    }

    public function markPurchased(Request $request, ShoppingList $shoppingList): JsonResponse
    {
        $validated = $request->validate([
            'purchased' => 'required|boolean',
        ]);

        $shoppingList->update(['purchased' => $validated['purchased']]);
        return response()->json($shoppingList->load('ingredient'));
    }
}
