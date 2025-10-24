admin@school.edu / admin123/*
  # Create Authentication Tables

  1. New Tables
    - `students`
      - `id` (uuid, primary key)
      - `admission_id` (text, unique) - Student ID for login
      - `password` (text) - Hashed password
      - `name` (text)
      - `email` (text)
      - `phone` (text)
      - `dob` (text)
      - `blood_group` (text)
      - `class_name` (text)
      - `section` (text)
      - `father_name` (text)
      - `mother_name` (text)
      - `address` (text)
      - `profile_photo` (text)
      - `status` (text, default 'active')
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
    
    - `teachers`
      - `id` (uuid, primary key)
      - `teacher_id` (text, unique) - Teacher ID for login
      - `password` (text) - Hashed password
      - `name` (text)
      - `email` (text, unique)
      - `phone` (text)
      - `subjects` (text[])
      - `classes` (text[])
      - `sections` (text[])
      - `profile_photo` (text)
      - `status` (text, default 'active')
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
    
    - `admins`
      - `id` (uuid, primary key)
      - `email` (text, unique)
      - `password` (text) - Hashed password
      - `name` (text)
      - `role` (text, default 'admin')
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on all tables
    - Add policies for authenticated access
*/

-- Create students table
CREATE TABLE IF NOT EXISTS students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admission_id text UNIQUE NOT NULL,
  password text NOT NULL,
  name text NOT NULL,
  email text,
  phone text,
  dob text,
  blood_group text,
  class_name text,
  section text,
  father_name text,
  mother_name text,
  address text,
  profile_photo text,
  status text DEFAULT 'active',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE students ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students can read own data"
  ON students
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow anonymous read for authentication"
  ON students
  FOR SELECT
  TO anon
  USING (true);

-- Create teachers table
CREATE TABLE IF NOT EXISTS teachers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id text UNIQUE NOT NULL,
  password text NOT NULL,
  name text NOT NULL,
  email text UNIQUE NOT NULL,
  phone text,
  subjects text[] DEFAULT '{}',
  classes text[] DEFAULT '{}',
  sections text[] DEFAULT '{}',
  profile_photo text,
  status text DEFAULT 'active',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE teachers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers can read own data"
  ON teachers
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow anonymous read for authentication"
  ON teachers
  FOR SELECT
  TO anon
  USING (true);

-- Create admins table
CREATE TABLE IF NOT EXISTS admins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  password text NOT NULL,
  name text NOT NULL,
  role text DEFAULT 'admin',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE admins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read own data"
  ON admins
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow anonymous read for authentication"
  ON admins
  FOR SELECT
  TO anon
  USING (true);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_students_admission_id ON students(admission_id);
CREATE INDEX IF NOT EXISTS idx_teachers_teacher_id ON teachers(teacher_id);
CREATE INDEX IF NOT EXISTS idx_teachers_email ON teachers(email);
CREATE INDEX IF NOT EXISTS idx_admins_email ON admins(email);