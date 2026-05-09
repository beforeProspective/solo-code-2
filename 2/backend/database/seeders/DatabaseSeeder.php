<?php

namespace Database\Seeders;

use App\Models\Borrowing;
use App\Models\DamageReport;
use App\Models\Tool;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $admin = User::create([
            'name' => '管理员',
            'email' => 'admin@example.com',
            'password' => bcrypt('password'),
            'credit_score' => 100,
            'is_admin' => true,
        ]);

        $user1 = User::create([
            'name' => '张三',
            'email' => 'zhangsan@example.com',
            'password' => bcrypt('password'),
            'credit_score' => 95,
        ]);

        $user2 = User::create([
            'name' => '李四',
            'email' => 'lisi@example.com',
            'password' => bcrypt('password'),
            'credit_score' => 100,
        ]);

        $user3 = User::create([
            'name' => '王五',
            'email' => 'wangwu@example.com',
            'password' => bcrypt('password'),
            'credit_score' => 75,
        ]);

        $tools = [
            [
                'name' => '电动螺丝刀',
                'description' => '充电式电动螺丝刀，适合家用组装家具',
                'category' => '电动工具',
                'condition' => 'good',
                'status' => 'available',
                'owner_id' => $user1->id,
                'image' => 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=electric%20screwdriver%20tool%20white%20background&image_size=square_hd',
            ],
            [
                'name' => '电钻',
                'description' => '多功能电钻，可钻孔和拧螺丝',
                'category' => '电动工具',
                'condition' => 'good',
                'status' => 'available',
                'owner_id' => $user2->id,
                'image' => 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=electric%20drill%20tool%20white%20background&image_size=square_hd',
            ],
            [
                'name' => '扳手套装',
                'description' => '全套扳手，包含各种尺寸',
                'category' => '手动工具',
                'condition' => 'good',
                'status' => 'available',
                'owner_id' => $user1->id,
                'image' => 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=wrench%20set%20tool%20white%20background&image_size=square_hd',
            ],
            [
                'name' => '锤子',
                'description' => '铁锤子，适合装修和木工',
                'category' => '手动工具',
                'condition' => 'good',
                'status' => 'available',
                'owner_id' => $user2->id,
                'image' => 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=hammer%20tool%20white%20background&image_size=square_hd',
            ],
            [
                'name' => '电锯',
                'description' => '链条锯，适合切割木材',
                'category' => '电动工具',
                'condition' => 'fair',
                'status' => 'available',
                'owner_id' => $user3->id,
                'image' => 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=chainsaw%20tool%20white%20background&image_size=square_hd',
            ],
            [
                'name' => '梯子',
                'description' => '铝合金梯子，可伸缩',
                'category' => '辅助工具',
                'condition' => 'good',
                'status' => 'available',
                'owner_id' => $user1->id,
                'image' => 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=aluminum%20ladder%20white%20background&image_size=square_hd',
            ],
            [
                'name' => '工具箱',
                'description' => '大号工具箱，可存放各种工具',
                'category' => '辅助工具',
                'condition' => 'good',
                'status' => 'available',
                'owner_id' => $user2->id,
                'image' => 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=tool%20box%20white%20background&image_size=square_hd',
            ],
            [
                'name' => '万用表',
                'description' => '数字万用表，测量电压电流',
                'category' => '测量工具',
                'condition' => 'good',
                'status' => 'available',
                'owner_id' => $user3->id,
                'image' => 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=multimeter%20digital%20white%20background&image_size=square_hd',
            ],
            [
                'name' => '卷尺',
                'description' => '5米钢卷尺',
                'category' => '测量工具',
                'condition' => 'good',
                'status' => 'available',
                'owner_id' => $user1->id,
                'image' => 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=measuring%20tape%20white%20background&image_size=square_hd',
            ],
            [
                'name' => '美工刀',
                'description' => '锋利美工刀，更换刀片方便',
                'category' => '切割工具',
                'condition' => 'good',
                'status' => 'available',
                'owner_id' => $user2->id,
                'image' => 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=utility%20knife%20white%20background&image_size=square_hd',
            ],
            [
                'name' => '螺丝刀套装',
                'description' => '多种规格螺丝刀套装',
                'category' => '手动工具',
                'condition' => 'good',
                'status' => 'available',
                'owner_id' => $user3->id,
                'image' => 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=screwdriver%20set%20white%20background&image_size=square_hd',
            ],
            [
                'name' => '水平仪',
                'description' => '激光水平仪，装修必备',
                'category' => '测量工具',
                'condition' => 'good',
                'status' => 'available',
                'owner_id' => $user1->id,
                'image' => 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=laser%20level%20tool%20white%20background&image_size=square_hd',
            ],
        ];

        foreach ($tools as $tool) {
            Tool::create($tool);
        }

        $borrowedTool = Tool::find(2);
        $borrowedTool->update(['status' => 'borrowed']);
        Borrowing::create([
            'tool_id' => $borrowedTool->id,
            'borrower_id' => $user1->id,
            'borrowed_at' => Carbon::now()->subDays(3),
            'due_date' => Carbon::now()->addDays(4),
            'status' => 'borrowed',
        ]);

        $lateTool = Tool::find(5);
        $lateTool->update(['status' => 'borrowed']);
        Borrowing::create([
            'tool_id' => $lateTool->id,
            'borrower_id' => $user3->id,
            'borrowed_at' => Carbon::now()->subDays(15),
            'due_date' => Carbon::now()->subDays(5),
            'status' => 'borrowed',
        ]);

        DamageReport::create([
            'tool_id' => 1,
            'reporter_id' => $user2->id,
            'damage_level' => 'minor',
            'description' => '电池续航有所下降',
            'status' => 'pending',
        ]);
    }
}
