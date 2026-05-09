<?php

namespace App\Http\Controllers\API;

use App\Http\Controllers\Controller;
use App\Models\Borrowing;
use App\Models\Tool;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class BorrowingController extends Controller
{
    public function index(Request $request)
    {
        $query = Borrowing::with('tool', 'borrower');

        if ($request->has('status')) {
            $query->where('status', $request->status);
        }

        $borrowings = $query->latest()->paginate(12);
        return response()->json($borrowings);
    }

    public function myBorrowings()
    {
        $borrowings = Borrowing::with('tool', 'borrower')
            ->where('borrower_id', Auth::id())
            ->latest()
            ->paginate(12);
        return response()->json($borrowings);
    }

    public function store(Request $request)
    {
        $request->validate([
            'tool_id' => 'required|exists:tools,id',
            'days' => 'required|integer|min:1|max:30',
        ]);

        $tool = Tool::findOrFail($request->tool_id);

        if ($tool->status !== 'available') {
            return response()->json(['message' => '该工具不可用'], 400);
        }

        if ($tool->owner_id === Auth::id()) {
            return response()->json(['message' => '不能借自己的工具'], 400);
        }

        $user = Auth::user();
        if ($user->credit_score < 30) {
            return response()->json(['message' => '信用分过低，无法借阅'], 400);
        }

        $borrowing = Borrowing::create([
            'tool_id' => $tool->id,
            'borrower_id' => Auth::id(),
            'borrowed_at' => Carbon::now(),
            'due_date' => Carbon::now()->addDays($request->days),
            'status' => 'borrowed',
        ]);

        $tool->update(['status' => 'borrowed']);

        return response()->json($borrowing->load('tool', 'borrower'), 201);
    }

    public function show(Borrowing $borrowing)
    {
        return response()->json($borrowing->load('tool', 'borrower'));
    }

    public function return(Request $request, Borrowing $borrowing)
    {
        if ($borrowing->borrower_id !== Auth::id() && !Auth::user()->is_admin) {
            return response()->json(['message' => '无权操作'], 403);
        }

        if ($borrowing->status === 'returned') {
            return response()->json(['message' => '该工具已归还'], 400);
        }

        $borrowing->update([
            'returned_at' => Carbon::now(),
            'status' => 'returned',
            'notes' => $request->notes,
        ]);

        $tool = $borrowing->tool;
        $tool->update(['status' => 'available']);

        $user = $borrowing->borrower;
        $isLate = Carbon::now()->greaterThan($borrowing->due_date);

        if ($isLate) {
            $daysLate = Carbon::now()->diffInDays($borrowing->due_date);
            $penalty = min($daysLate * 5, 30);
            $user->deductCredit($penalty);
        } else {
            $user->addCredit(2);
        }

        return response()->json([
            'message' => '归还成功',
            'borrowing' => $borrowing->load('tool', 'borrower'),
            'is_late' => $isLate,
            'credit_change' => $isLate ? -$penalty : 2,
        ]);
    }

    public function checkOverdue()
    {
        $overdueBorrowings = Borrowing::where('status', 'borrowed')
            ->where('due_date', '<', Carbon::now())
            ->with('tool', 'borrower')
            ->get();

        return response()->json($overdueBorrowings);
    }
}
