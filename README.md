# Bảng Điểm CLB Bóng Bàn — bản dùng PostgreSQL

Gồm 2 phần chạy riêng biệt:
- `backend/`  — Django + Django REST Framework, dữ liệu lưu trong **PostgreSQL**, ảnh VĐV lưu trong `backend/media/players/`.
- `frontend/` — Giao diện React (Vite) gọi API của backend.

## 1. Cài đặt lần đầu

### 1a. Cài PostgreSQL (nếu server chưa có)
```
sudo apt update
sudo apt install postgresql postgresql-contrib -y
```
Tạo database và user (thay mật khẩu thật ở dòng PASSWORD):
```
sudo -u postgres psql
CREATE DATABASE ttclub;
CREATE USER ttclub_user WITH PASSWORD 'mat-khau-that-cua-ban';
ALTER ROLE ttclub_user SET client_encoding TO 'utf8';
GRANT ALL PRIVILEGES ON DATABASE ttclub TO ttclub_user;
ALTER DATABASE ttclub OWNER TO ttclub_user;
\q
```

### 1b. Cấu hình backend
```
cd backend
cp .env.example .env
```
Mở file `.env` vừa tạo, điền đúng `DB_PASSWORD` (và các giá trị khác nếu khác mặc định).

```
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python manage.py migrate
python manage.py setup_groups
python manage.py createsuperuser
python manage.py runserver
```
Django Admin: http://127.0.0.1:8000/admin
API: http://127.0.0.1:8000/api/

### 1c. Frontend (mở terminal thứ 2, giữ terminal backend đang chạy)
```
cd frontend
npm install
npm run dev
```
Mở http://localhost:5173

## 2. Chạy lại các lần sau
```
sudo service postgresql start   # nếu PostgreSQL chưa tự chạy nền
cd backend  && source .venv/bin/activate && python manage.py runserver
cd frontend && npm run dev
```

## 3. Chạy tạm bằng SQLite (không cần PostgreSQL) lúc phát triển
Trong file `.env`, đổi dòng:
```
DB_ENGINE=django.db.backends.sqlite3
```
rồi chạy `python manage.py migrate` lại như bình thường.

## 4. Sao lưu dữ liệu
- Database: `pg_dump -U ttclub_user ttclub > backup.sql` (chạy định kỳ, ví dụ cron hàng ngày).
- Ảnh VĐV: sao lưu thư mục `backend/media/`.

## 5. Trước khi triển khai public
Xem ghi chú đầu file `backend/ranking/views.py` — cần:
1. Bật lại kiểm tra phân quyền thật (class `IsAdminOrManagerOrScorerOrReadOnly`).
2. Thêm màn hình đăng nhập ở frontend.
3. **Không đưa file `.env` thật lên Git hoặc host công khai** — chỉ đặt trực tiếp trên server/PaaS.

## 6. Triển khai trên Vibe Hosting (Mắt Bão)

Xem hướng dẫn chi tiết trong cuộc trò chuyện với Claude, tóm tắt các điểm chính:
- Tạo 2 "app" riêng trên Vibe Hosting từ cùng 1 repo: 1 cho `backend/`, 1 cho `frontend/` (nền tảng hỗ trợ chọn thư mục con).
- Backend: đặt biến môi trường `SECRET_KEY`, `DEBUG=False`, `ALLOWED_HOSTS`, `DATABASE_URL` (hoặc các biến `DB_*` rời), `CORS_ALLOWED_ORIGINS` (domain của app frontend).
- Frontend: đặt biến môi trường `VITE_API_ORIGIN` = domain public của app backend.
- File `Procfile` trong `backend/` đã khai báo sẵn lệnh chạy (`gunicorn`) và lệnh `migrate` tự động mỗi lần deploy.
- **Lưu ý về ảnh VĐV**: nếu hạ tầng PaaS dùng container tạm (ephemeral), file ảnh trong `media/` có thể mất khi deploy lại — cần hỏi Mắt Bão về lưu trữ bền vững (persistent volume) hoặc chuyển sang lưu ảnh trên S3-compatible storage khi cần dùng lâu dài.

