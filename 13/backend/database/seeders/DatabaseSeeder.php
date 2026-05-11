<?php

namespace Database\Seeders;

use App\Models\Announcement;
use App\Models\Applicant;
use App\Models\Attendance;
use App\Models\Department;
use App\Models\Document;
use App\Models\DocumentCategory;
use App\Models\Employee;
use App\Models\Interview;
use App\Models\JobPosting;
use App\Models\LeaveRequest;
use App\Models\Notification;
use App\Models\PerformanceReview;
use App\Models\Position;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $admin = User::create([
            'name' => '系统管理员',
            'email' => 'admin@hrms.local',
            'password' => Hash::make('admin123'),
            'role' => 'admin',
        ]);

        $hrUser = User::create([
            'name' => 'HR经理',
            'email' => 'hr@hrms.local',
            'password' => Hash::make('hr123456'),
            'role' => 'hr',
        ]);

        $managerUser = User::create([
            'name' => '技术总监',
            'email' => 'manager@hrms.local',
            'password' => Hash::make('manager123'),
            'role' => 'manager',
        ]);

        $employeeUser = User::create([
            'name' => '张三',
            'email' => 'employee@hrms.local',
            'password' => Hash::make('employee123'),
            'role' => 'employee',
        ]);

        $employee2 = User::create([
            'name' => '李四',
            'email' => 'lisi@hrms.local',
            'password' => Hash::make('lisi123456'),
            'role' => 'employee',
        ]);

        $employee3 = User::create([
            'name' => '王五',
            'email' => 'wangwu@hrms.local',
            'password' => Hash::make('wangwu123456'),
            'role' => 'employee',
        ]);

        $techDept = Department::create([
            'name' => '技术部',
            'description' => '负责产品研发和技术支持',
            'manager_id' => $managerUser->id,
        ]);

        $hrDept = Department::create([
            'name' => '人力资源部',
            'description' => '负责人力资源管理和行政事务',
            'manager_id' => $hrUser->id,
        ]);

        $financeDept = Department::create([
            'name' => '财务部',
            'description' => '负责财务管理和预算',
        ]);

        $devPosition = Position::create([
            'title' => '高级软件工程师',
            'description' => '负责核心系统的设计和开发',
            'department_id' => $techDept->id,
            'min_salary' => 15000,
            'max_salary' => 30000,
        ]);

        Position::create([
            'title' => '前端开发工程师',
            'description' => '负责Web前端开发',
            'department_id' => $techDept->id,
            'min_salary' => 12000,
            'max_salary' => 25000,
        ]);

        Position::create([
            'title' => 'HR专员',
            'description' => '负责招聘和员工关系',
            'department_id' => $hrDept->id,
            'min_salary' => 8000,
            'max_salary' => 15000,
        ]);

        Position::create([
            'title' => '财务会计',
            'description' => '负责财务核算',
            'department_id' => $financeDept->id,
            'min_salary' => 10000,
            'max_salary' => 20000,
        ]);

        Employee::create([
            'user_id' => $admin->id,
            'employee_code' => 'EMP001',
            'first_name' => '系统',
            'last_name' => '管理员',
            'gender' => 'male',
            'date_of_birth' => '1985-01-15',
            'phone' => '13800138001',
            'address' => '北京市朝阳区',
            'emergency_contact_name' => '家人',
            'emergency_contact_phone' => '13900139001',
            'id_number' => '110101198501150001',
            'hire_date' => '2020-01-01',
            'department_id' => $techDept->id,
            'position_id' => $devPosition->id,
            'manager_id' => $managerUser->id,
            'salary' => 50000,
            'employment_type' => 'full_time',
            'work_location' => '北京总部',
            'status' => 'active',
        ]);

        Employee::create([
            'user_id' => $hrUser->id,
            'employee_code' => 'EMP002',
            'first_name' => 'HR',
            'last_name' => '经理',
            'gender' => 'female',
            'date_of_birth' => '1988-05-20',
            'phone' => '13800138002',
            'address' => '北京市海淀区',
            'emergency_contact_name' => '家人',
            'emergency_contact_phone' => '13900139002',
            'id_number' => '110101198805200002',
            'hire_date' => '2021-03-15',
            'department_id' => $hrDept->id,
            'position_id' => 3,
            'salary' => 25000,
            'employment_type' => 'full_time',
            'work_location' => '北京总部',
            'status' => 'active',
        ]);

        Employee::create([
            'user_id' => $managerUser->id,
            'employee_code' => 'EMP003',
            'first_name' => '技术',
            'last_name' => '总监',
            'gender' => 'male',
            'date_of_birth' => '1982-08-10',
            'phone' => '13800138003',
            'address' => '北京市西城区',
            'emergency_contact_name' => '家人',
            'emergency_contact_phone' => '13900139003',
            'id_number' => '110101198208100003',
            'hire_date' => '2019-06-01',
            'department_id' => $techDept->id,
            'position_id' => $devPosition->id,
            'salary' => 45000,
            'employment_type' => 'full_time',
            'work_location' => '北京总部',
            'status' => 'active',
        ]);

        Employee::create([
            'user_id' => $employeeUser->id,
            'employee_code' => 'EMP004',
            'first_name' => '张',
            'last_name' => '三',
            'gender' => 'male',
            'date_of_birth' => '1990-11-25',
            'phone' => '13800138004',
            'address' => '北京市朝阳区',
            'emergency_contact_name' => '家人',
            'emergency_contact_phone' => '13900139004',
            'id_number' => '110101199011250004',
            'hire_date' => '2022-01-10',
            'department_id' => $techDept->id,
            'position_id' => 2,
            'manager_id' => $managerUser->id,
            'salary' => 20000,
            'employment_type' => 'full_time',
            'work_location' => '北京总部',
            'status' => 'active',
        ]);

        Employee::create([
            'user_id' => $employee2->id,
            'employee_code' => 'EMP005',
            'first_name' => '李',
            'last_name' => '四',
            'gender' => 'female',
            'date_of_birth' => '1992-03-18',
            'phone' => '13800138005',
            'address' => '北京市东城区',
            'emergency_contact_name' => '家人',
            'emergency_contact_phone' => '13900139005',
            'id_number' => '110101199203180005',
            'hire_date' => '2022-08-01',
            'department_id' => $techDept->id,
            'position_id' => 2,
            'manager_id' => $managerUser->id,
            'salary' => 18000,
            'employment_type' => 'full_time',
            'work_location' => '北京总部',
            'status' => 'active',
        ]);

        Employee::create([
            'user_id' => $employee3->id,
            'employee_code' => 'EMP006',
            'first_name' => '王',
            'last_name' => '五',
            'gender' => 'male',
            'date_of_birth' => '1989-07-22',
            'phone' => '13800138006',
            'address' => '北京市丰台区',
            'emergency_contact_name' => '家人',
            'emergency_contact_phone' => '13900139006',
            'id_number' => '110101198907220006',
            'hire_date' => '2021-12-01',
            'department_id' => $financeDept->id,
            'position_id' => 4,
            'salary' => 16000,
            'employment_type' => 'full_time',
            'work_location' => '北京总部',
            'status' => 'active',
        ]);

        $today = Carbon::today();
        $users = [$employeeUser->id, $employee2->id, $employee3->id];

        foreach ($users as $userId) {
            for ($i = 0; $i < 30; $i++) {
                $date = $today->copy()->subDays($i);
                if ($date->isWeekday()) {
                    Attendance::create([
                        'user_id' => $userId,
                        'date' => $date,
                        'clock_in' => '09:' . rand(0, 30) . ':00',
                        'clock_out' => '18:' . rand(0, 59) . ':00',
                        'status' => rand(0, 20) ? 'present' : 'absent',
                        'location' => '北京总部',
                    ]);
                }
            }
        }

        LeaveRequest::create([
            'user_id' => $employeeUser->id,
            'leave_type' => 'annual',
            'start_date' => $today->copy()->addDays(5),
            'end_date' => $today->copy()->addDays(10),
            'total_days' => 5,
            'reason' => '年假，需要回家处理一些个人事务',
            'approver_id' => $managerUser->id,
            'status' => 'pending',
        ]);

        LeaveRequest::create([
            'user_id' => $employee2->id,
            'leave_type' => 'sick',
            'start_date' => $today->copy()->subDays(2),
            'end_date' => $today->copy()->subDays(2),
            'total_days' => 1,
            'reason' => '身体不适，需要休息',
            'approver_id' => $managerUser->id,
            'status' => 'approved',
            'approved_at' => $today->copy()->subDays(3),
            'approver_comment' => '已批准，请好好休息',
        ]);

        PerformanceReview::create([
            'user_id' => $employeeUser->id,
            'manager_id' => $managerUser->id,
            'review_period' => '2024 Q1',
            'status' => 'self_review',
            'goals' => json_encode([
                ['title' => '完成系统重构', 'progress' => 85, 'status' => 'in_progress'],
                ['title' => '学习新技术栈', 'progress' => 60, 'status' => 'in_progress'],
                ['title' => '提升团队协作', 'progress' => 90, 'status' => 'completed'],
            ]),
        ]);

        PerformanceReview::create([
            'user_id' => $employee2->id,
            'manager_id' => $managerUser->id,
            'review_period' => '2023 Q4',
            'status' => 'completed',
            'self_assessment' => '本季度表现良好，按时完成了所有分配的任务',
            'self_rating' => 4.2,
            'manager_assessment' => '李四位工作认真负责，技术能力强，团队协作良好',
            'manager_rating' => 4.5,
            'overall_rating' => 4.4,
            'finalized_at' => $today->copy()->subDays(60),
        ]);

        $job1 = JobPosting::create([
            'title' => '高级后端工程师',
            'department_id' => $techDept->id,
            'position_id' => $devPosition->id,
            'description' => '负责公司核心产品的后端架构设计和开发',
            'requirements' => json_encode(['5年以上开发经验', '精通Java/Python', '熟悉微服务架构']),
            'benefits' => json_encode(['五险一金', '年终奖', '带薪年假']),
            'min_salary' => 25000,
            'max_salary' => 40000,
            'location' => '北京',
            'employment_type' => 'full_time',
            'status' => 'published',
            'publish_date' => $today->copy()->subDays(15),
            'created_by' => $hrUser->id,
        ]);

        JobPosting::create([
            'title' => 'HR招聘专员',
            'department_id' => $hrDept->id,
            'position_id' => 3,
            'description' => '负责公司招聘流程管理和候选人对接',
            'requirements' => json_encode(['2年以上招聘经验', '熟悉招聘渠道', '良好的沟通能力']),
            'min_salary' => 10000,
            'max_salary' => 18000,
            'location' => '北京',
            'employment_type' => 'full_time',
            'status' => 'published',
            'publish_date' => $today->copy()->subDays(10),
            'created_by' => $hrUser->id,
        ]);

        $applicant1 = Applicant::create([
            'job_posting_id' => $job1->id,
            'first_name' => '赵',
            'last_name' => '六',
            'email' => 'zhaoliu@email.com',
            'phone' => '13900139010',
            'cover_letter' => '我是一名拥有6年经验的后端开发工程师，对贵公司的职位非常感兴趣。',
            'skills' => json_encode(['Java', 'Spring Boot', 'MySQL', 'Redis']),
            'status' => 'shortlisted',
            'rating' => 4.5,
        ]);

        Applicant::create([
            'job_posting_id' => $job1->id,
            'first_name' => '钱',
            'last_name' => '七',
            'email' => 'qianqi@email.com',
            'phone' => '13900139011',
            'cover_letter' => '我对后端开发充满热情，期待加入你们的团队。',
            'skills' => json_encode(['PHP', 'Laravel', 'MySQL']),
            'status' => 'new',
        ]);

        Interview::create([
            'applicant_id' => $applicant1->id,
            'job_posting_id' => $job1->id,
            'scheduled_at' => $today->copy()->addDays(3)->setHour(14)->setMinute(0),
            'interviewer_id' => $managerUser->id,
            'type' => 'technical',
            'location' => '会议室A',
            'status' => 'scheduled',
        ]);

        Announcement::create([
            'title' => '关于春节假期安排的通知',
            'content' => '春节假期安排如下：2025年1月28日至2月4日放假，共8天。请各部门提前做好工作安排。',
            'type' => 'holiday',
            'created_by' => $admin->id,
            'is_pinned' => true,
            'publish_date' => $today->copy()->subDays(5),
            'status' => 'published',
        ]);

        Announcement::create([
            'title' => '新员工入职培训',
            'content' => '本月新员工入职培训将于1月20日上午9点在培训室举行，请准时参加。',
            'type' => 'training',
            'created_by' => $hrUser->id,
            'publish_date' => $today->copy()->subDays(2),
            'status' => 'published',
        ]);

        $notifications = [
            ['user_id' => $employeeUser->id, 'title' => '新公告发布', 'message' => '系统管理员发布了新公告', 'type' => 'announcement'],
            ['user_id' => $employeeUser->id, 'title' => '绩效评估提醒', 'message' => '您的2024 Q1绩效评估已开启自评', 'type' => 'task'],
            ['user_id' => $managerUser->id, 'title' => '请假申请待审批', 'message' => '张三提交了新的请假申请', 'type' => 'approval'],
            ['user_id' => $hrUser->id, 'title' => '新简历收到', 'message' => '收到新的职位申请简历', 'type' => 'recruitment'],
        ];

        foreach ($notifications as $notification) {
            Notification::create($notification);
        }

        $cat1 = DocumentCategory::create(['name' => '员工手册', 'description' => '公司规章制度和员工手册']);
        $cat2 = DocumentCategory::create(['name' => '培训资料', 'description' => '各类培训资料和文档']);
        $cat3 = DocumentCategory::create(['name' => '合同模板', 'description' => '各类合同和协议模板']);

        Document::create([
            'name' => '员工手册2024版.pdf',
            'path' => '/documents/employee-handbook.pdf',
            'type' => 'pdf',
            'mime_type' => 'application/pdf',
            'size' => 2500000,
            'description' => '2024年最新版员工手册',
            'category_id' => $cat1->id,
            'visibility' => 'public',
            'created_by' => $hrUser->id,
        ]);

        Document::create([
            'name' => '新员工入职指南.docx',
            'path' => '/documents/onboarding-guide.docx',
            'type' => 'document',
            'mime_type' => 'application/msword',
            'size' => 500000,
            'description' => '新员工入职流程指南',
            'category_id' => $cat2->id,
            'visibility' => 'public',
            'created_by' => $hrUser->id,
        ]);

        Document::create([
            'name' => '劳动合同模板.docx',
            'path' => '/documents/contract-template.docx',
            'type' => 'document',
            'mime_type' => 'application/msword',
            'size' => 300000,
            'description' => '标准劳动合同模板',
            'category_id' => $cat3->id,
            'visibility' => 'private',
            'created_by' => $admin->id,
        ]);
    }
}
