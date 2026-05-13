<?php

namespace App\Http\Controllers;

use App\Models\Subscriber;
use Illuminate\Http\Request;

class SubscriberController extends Controller
{
    public function index()
    {
        $subscribers = Subscriber::orderBy('created_at', 'desc')->paginate(20);
        return response()->json($subscribers);
    }

    public function publicSubscribe(Request $request)
    {
        $validated = $request->validate([
            'email' => 'required|email|unique:subscribers,email',
        ]);

        $subscriber = Subscriber::create([
            'email' => $validated['email'],
            'verified' => true,
            'verification_token' => null,
        ]);

        return response()->json([
            'message' => 'Successfully subscribed',
            'subscriber' => $subscriber,
        ], 201);
    }

    public function publicUnsubscribe(Request $request)
    {
        $validated = $request->validate([
            'email' => 'required|email|exists:subscribers,email',
        ]);

        Subscriber::where('email', $validated['email'])->delete();

        return response()->json(['message' => 'Successfully unsubscribed']);
    }

    public function destroy(Subscriber $subscriber)
    {
        $subscriber->delete();

        return response()->json(null, 204);
    }
}
