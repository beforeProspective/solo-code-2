<?php

namespace Database\Seeders;

use App\Models\User;
use App\Models\Currency;
use App\Models\Account;
use App\Models\Category;
use App\Models\Tag;
use App\Models\Transaction;
use App\Models\Budget;
use App\Models\Bill;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $this->seedCurrencies();
        $this->seedDefaultUser();
    }

    protected function seedCurrencies()
    {
        $currencies = [
            ['code' => 'CNY', 'name' => '人民币', 'symbol' => '¥', 'rate_to_usd' => 7.240000],
            ['code' => 'USD', 'name' => '美元', 'symbol' => '$', 'rate_to_usd' => 1.000000],
            ['code' => 'EUR', 'name' => '欧元', 'symbol' => '€', 'rate_to_usd' => 0.920000],
            ['code' => 'GBP', 'name' => '英镑', 'symbol' => '£', 'rate_to_usd' => 0.790000],
            ['code' => 'JPY', 'name' => '日元', 'symbol' => '¥', 'rate_to_usd' => 155.000000],
            ['code' => 'KRW', 'name' => '韩元', 'symbol' => '₩', 'rate_to_usd' => 1360.000000],
            ['code' => 'HKD', 'name' => '港币', 'symbol' => 'HK$', 'rate_to_usd' => 7.820000],
            ['code' => 'SGD', 'name' => '新加坡元', 'symbol' => 'S$', 'rate_to_usd' => 1.340000],
        ];

        foreach ($currencies as $currency) {
            Currency::updateOrCreate(['code' => $currency['code']], $currency);
        }
    }

    protected function seedDefaultUser()
    {
        $user = User::updateOrCreate(
            ['email' => 'admin@finance.app'],
            [
                'name' => '默认用户',
                'email' => 'admin@finance.app',
                'password' => Hash::make('password123'),
            ]
        );

        $categories = [
            ['name' => '餐饮', 'type' => 'expense', 'color' => '#ef4444'],
            ['name' => '交通', 'type' => 'expense', 'color' => '#f97316'],
            ['name' => '购物', 'type' => 'expense', 'color' => '#eab308'],
            ['name' => '娱乐', 'type' => 'expense', 'color' => '#22c55e'],
            ['name' => '医疗', 'type' => 'expense', 'color' => '#3b82f6'],
            ['name' => '教育', 'type' => 'expense', 'color' => '#8b5cf6'],
            ['name' => '住房', 'type' => 'expense', 'color' => '#ec4899'],
            ['name' => '工资', 'type' => 'income', 'color' => '#10b981'],
            ['name' => '投资', 'type' => 'income', 'color' => '#06b6d4'],
            ['name' => '其他收入', 'type' => 'income', 'color' => '#6366f1'],
        ];

        $categoryIds = [];
        foreach ($categories as $category) {
            $cat = Category::updateOrCreate(
                ['user_id' => $user->id, 'name' => $category['name']],
                array_merge($category, ['user_id' => $user->id, 'is_system' => true])
            );
            $categoryIds[$category['name']] = $cat->id;
        }

        $tags = ['必要开支', '可选开支', '紧急', '工作相关', '家庭'];
        foreach ($tags as $tag) {
            Tag::updateOrCreate(
                ['user_id' => $user->id, 'name' => $tag],
                ['user_id' => $user->id]
            );
        }

        $accounts = [
            ['name' => '工商银行', 'type' => 'checking', 'currency' => 'CNY', 'balance' => 15000.00, 'color' => '#e74c3c'],
            ['name' => '招商银行', 'type' => 'savings', 'currency' => 'CNY', 'balance' => 50000.00, 'color' => '#e67e22'],
            ['name' => '支付宝', 'type' => 'digital', 'currency' => 'CNY', 'balance' => 3500.00, 'color' => '#1677ff'],
            ['name' => '现金', 'type' => 'cash', 'currency' => 'CNY', 'balance' => 2000.00, 'color' => '#27ae60'],
        ];

        $accountIds = [];
        foreach ($accounts as $account) {
            $acc = Account::updateOrCreate(
                ['user_id' => $user->id, 'name' => $account['name']],
                array_merge($account, ['user_id' => $user->id])
            );
            $accountIds[$account['name']] = $acc->id;
        }

        $transactions = [
            ['account_id' => $accountIds['工商银行'], 'category_id' => $categoryIds['工资'], 'type' => 'income', 'amount' => 15000, 'currency' => 'CNY', 'description' => '月薪', 'transaction_date' => now()->subDays(10)],
            ['account_id' => $accountIds['工商银行'], 'category_id' => $categoryIds['住房'], 'type' => 'expense', 'amount' => 3500, 'currency' => 'CNY', 'description' => '房租', 'transaction_date' => now()->subDays(9)],
            ['account_id' => $accountIds['支付宝'], 'category_id' => $categoryIds['餐饮'], 'type' => 'expense', 'amount' => 58, 'currency' => 'CNY', 'description' => '美团外卖', 'transaction_date' => now()->subDays(8)],
            ['account_id' => $accountIds['支付宝'], 'category_id' => $categoryIds['交通'], 'type' => 'expense', 'amount' => 35, 'currency' => 'CNY', 'description' => '滴滴打车', 'transaction_date' => now()->subDays(7)],
            ['account_id' => $accountIds['支付宝'], 'category_id' => $categoryIds['购物'], 'type' => 'expense', 'amount' => 299, 'currency' => 'CNY', 'description' => '淘宝购物', 'transaction_date' => now()->subDays(6)],
            ['account_id' => $accountIds['工商银行'], 'category_id' => $categoryIds['娱乐'], 'type' => 'expense', 'amount' => 200, 'currency' => 'CNY', 'description' => '电影票', 'transaction_date' => now()->subDays(5)],
            ['account_id' => $accountIds['现金'], 'category_id' => $categoryIds['餐饮'], 'type' => 'expense', 'amount' => 45, 'currency' => 'CNY', 'description' => '午餐', 'transaction_date' => now()->subDays(4)],
            ['account_id' => $accountIds['工商银行'], 'category_id' => $categoryIds['投资'], 'type' => 'income', 'amount' => 1200, 'currency' => 'CNY', 'description' => '基金收益', 'transaction_date' => now()->subDays(3)],
            ['account_id' => $accountIds['支付宝'], 'category_id' => $categoryIds['餐饮'], 'type' => 'expense', 'amount' => 128, 'currency' => 'CNY', 'description' => '聚餐', 'transaction_date' => now()->subDays(2)],
            ['account_id' => $accountIds['工商银行'], 'category_id' => $categoryIds['医疗'], 'type' => 'expense', 'amount' => 156, 'currency' => 'CNY', 'description' => '药店', 'transaction_date' => now()->subDay()],
        ];

        foreach ($transactions as $transaction) {
            Transaction::updateOrCreate(
                [
                    'user_id' => $user->id,
                    'description' => $transaction['description'],
                    'transaction_date' => $transaction['transaction_date']
                ],
                array_merge($transaction, ['user_id' => $user->id])
            );
        }

        $budgets = [
            ['name' => '餐饮预算', 'category_id' => $categoryIds['餐饮'], 'amount' => 2000, 'currency' => 'CNY', 'period' => 'monthly', 'year' => now()->year, 'month' => now()->month],
            ['name' => '娱乐预算', 'category_id' => $categoryIds['娱乐'], 'amount' => 1000, 'currency' => 'CNY', 'period' => 'monthly', 'year' => now()->year, 'month' => now()->month],
            ['name' => '交通预算', 'category_id' => $categoryIds['交通'], 'amount' => 500, 'currency' => 'CNY', 'period' => 'monthly', 'year' => now()->year, 'month' => now()->month],
        ];

        foreach ($budgets as $budget) {
            Budget::updateOrCreate(
                ['user_id' => $user->id, 'name' => $budget['name']],
                array_merge($budget, ['user_id' => $user->id])
            );
        }

        $bills = [
            ['name' => '房租', 'account_id' => $accountIds['工商银行'], 'category_id' => $categoryIds['住房'], 'amount' => 3500, 'currency' => 'CNY', 'due_date' => now()->addDays(20), 'frequency' => 'monthly'],
            ['name' => '水电费', 'account_id' => $accountIds['支付宝'], 'category_id' => $categoryIds['住房'], 'amount' => 200, 'currency' => 'CNY', 'due_date' => now()->addDays(5), 'frequency' => 'monthly'],
            ['name' => '手机话费', 'account_id' => $accountIds['支付宝'], 'category_id' => $categoryIds['交通'], 'amount' => 99, 'currency' => 'CNY', 'due_date' => now()->addDays(10), 'frequency' => 'monthly'],
        ];

        foreach ($bills as $bill) {
            Bill::updateOrCreate(
                ['user_id' => $user->id, 'name' => $bill['name']],
                array_merge($bill, ['user_id' => $user->id])
            );
        }
    }
}
