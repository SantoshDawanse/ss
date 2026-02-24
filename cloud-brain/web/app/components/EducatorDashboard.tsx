'use client';

import React, { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import {
  TrendingUp,
  CheckCircle,
  AlertTriangle,
  Users,
  RefreshCw,
  Search,
  Download,
  Info,
} from 'lucide-react';
import type {
  DashboardData,
  StudentProgress,
  ClassPerformanceReport,
  CurriculumCoverageReport,
} from '../types';

export const EducatorDashboard: React.FC = () => {
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [students, setStudents] = useState<Array<{studentId: string; studentName: string; registrationTimestamp: string}>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchStudents();
    fetchDashboardData();
  }, []);

  const fetchStudents = async () => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://zm3d9kk179.execute-api.us-east-1.amazonaws.com/development';
      
      const response = await fetch(
        `${apiUrl}/educator/students?limit=100`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
      
      if (!response.ok) {
        throw new Error(`Failed to fetch students: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      setStudents(data.students || []);
    } catch (err) {
      console.error('Error fetching students:', err);
      // Don't set error state here, let dashboard data fetch handle it
    }
  };

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://zm3d9kk179.execute-api.us-east-1.amazonaws.com/development';
      const educatorId = 'EDU001';
      const classIds = 'CLASS001';
      
      const response = await fetch(
        `${apiUrl}/educator/dashboard?educator_id=${educatorId}&class_ids=${classIds}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
      
      if (!response.ok) {
        throw new Error(`API request failed: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      setDashboardData(data);
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch dashboard data');
      setDashboardData(null);
    } finally {
      setLoading(false);
    }
  };

  const filteredStudents = dashboardData?.student_progress.filter(student =>
    student.student_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    student.subject.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <RefreshCw className="h-12 w-12 animate-spin text-primary" />
        <p className="text-muted-foreground">Loading dashboard data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Unable to Load Dashboard
            </CardTitle>
            <CardDescription>
              The cloud-brain API is not responding. Please check the following:
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
            
            <div className="space-y-2 text-sm">
              <p className="font-medium">Troubleshooting steps:</p>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                <li>Verify the API endpoint is deployed and accessible</li>
                <li>Check that the educator dashboard Lambda function is running</li>
                <li>Ensure there is data in the DynamoDB tables</li>
                <li>Run the seed script: <code className="bg-muted px-1 py-0.5 rounded">python scripts/seed_sample_data.py</code></li>
                <li>Check CloudWatch logs for errors</li>
              </ul>
            </div>

            <div className="flex gap-2">
              <Button onClick={fetchDashboardData} variant="default">
                <RefreshCw className="h-4 w-4 mr-2" />
                Retry Connection
              </Button>
              <Button variant="outline" asChild>
                <a href="https://console.aws.amazon.com/lambda" target="_blank" rel="noopener noreferrer">
                  Open AWS Console
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!dashboardData || dashboardData.student_progress.length === 0) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Info className="h-5 w-5" />
              {students.length > 0 ? 'Registered Students' : 'No Student Data Available'}
            </CardTitle>
            <CardDescription>
              {students.length > 0 
                ? `${students.length} student${students.length > 1 ? 's' : ''} registered, but no performance data available yet.`
                : 'The API is working but no student performance data is available yet.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {students.length > 0 && (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Student Name</TableHead>
                      <TableHead>Student ID</TableHead>
                      <TableHead>Registration Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {students.map((student) => (
                      <TableRow key={student.studentId}>
                        <TableCell className="font-medium">{student.studentName}</TableCell>
                        <TableCell className="text-muted-foreground">{student.studentId}</TableCell>
                        <TableCell>{new Date(student.registrationTimestamp).toLocaleDateString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                
                <Separator />
              </>
            )}
            
            <Alert>
              <AlertDescription>
                <p className="font-medium mb-2">To see performance data in the dashboard:</p>
                <ol className="list-decimal list-inside space-y-1 text-sm">
                  <li>Students need to use the local-brain mobile app</li>
                  <li>Complete lessons and quizzes to generate performance data</li>
                  <li>Sync their data with the cloud-brain (tap "Sync Now" in the app)</li>
                  <li>Wait a few moments and refresh this dashboard</li>
                </ol>
              </AlertDescription>
            </Alert>
            
            <Separator />
            
            <div className="space-y-2">
              <p className="text-sm font-medium">Quick Start Options:</p>
              <div className="flex gap-2">
                <Button onClick={() => { fetchStudents(); fetchDashboardData(); }} variant="default">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh Dashboard
                </Button>
                <Button variant="outline" onClick={() => window.open('/api-docs', '_blank')}>
                  View API Documentation
                </Button>
              </div>
            </div>

            <Alert variant="default" className="bg-blue-50 border-blue-200">
              <Info className="h-4 w-4 text-blue-600" />
              <AlertDescription className="text-blue-900">
                <strong>Testing Tip:</strong> Use the local-brain mobile app to generate sample data. 
                Open the app, complete a lesson or quiz, then sync to see results here.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold tracking-tight">Sikshya-Sathi Dashboard</h1>
          <p className="text-muted-foreground mt-1">Monitor student progress and class performance</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={() => { fetchStudents(); fetchDashboardData(); }}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon">
            <Download className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Students</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{dashboardData.student_progress.length}</div>
            <p className="text-xs text-muted-foreground">Enrolled in classes</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Students</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {dashboardData.class_reports[0]?.active_students || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              {((dashboardData.class_reports[0]?.active_students / dashboardData.class_reports[0]?.total_students) * 100).toFixed(0)}% active rate
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Accuracy</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {(dashboardData.class_reports[0]?.average_accuracy * 100 || 0).toFixed(0)}%
            </div>
            <p className="text-xs text-muted-foreground">Class average</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Need Support</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {dashboardData.class_reports[0]?.struggling_students.length || 0}
            </div>
            <p className="text-xs text-muted-foreground">Requires attention</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="students" className="space-y-4">
        <TabsList>
          <TabsTrigger value="students">Student Progress</TabsTrigger>
          <TabsTrigger value="class">Class Performance</TabsTrigger>
          <TabsTrigger value="curriculum">Curriculum Coverage</TabsTrigger>
        </TabsList>

        <TabsContent value="students" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Student Progress</CardTitle>
                  <CardDescription>Track individual student performance</CardDescription>
                </div>
                <div className="relative w-64">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search students..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-8"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead className="text-right">Lessons</TableHead>
                    <TableHead className="text-right">Quizzes</TableHead>
                    <TableHead className="text-right">Accuracy</TableHead>
                    <TableHead className="text-right">Mastered</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredStudents.map((progress, index) => (
                    <TableRow key={index}>
                      <TableCell className="font-medium">{progress.student_name}</TableCell>
                      <TableCell>{progress.subject}</TableCell>
                      <TableCell className="text-right">{progress.lessons_completed}</TableCell>
                      <TableCell className="text-right">{progress.quizzes_completed}</TableCell>
                      <TableCell className="text-right">
                        {(progress.average_accuracy * 100).toFixed(0)}%
                      </TableCell>
                      <TableCell className="text-right">{progress.topics_mastered.length}</TableCell>
                      <TableCell>
                        {progress.average_accuracy > 0.8 ? (
                          <Badge variant="default" className="bg-green-500">Excellent</Badge>
                        ) : progress.average_accuracy > 0.6 ? (
                          <Badge variant="default" className="bg-blue-500">Good</Badge>
                        ) : (
                          <Badge variant="default" className="bg-yellow-500">Needs Support</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="class" className="space-y-4">
          {dashboardData.class_reports.map((report, index) => (
            <Card key={index}>
              <CardHeader>
                <CardTitle>{report.class_name} - {report.subject}</CardTitle>
                <CardDescription>Class performance overview</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Completion Rate</span>
                      <span className="font-medium">{(report.average_completion_rate * 100).toFixed(0)}%</span>
                    </div>
                    <Progress value={report.average_completion_rate * 100} />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Average Accuracy</span>
                      <span className="font-medium">{(report.average_accuracy * 100).toFixed(0)}%</span>
                    </div>
                    <Progress value={report.average_accuracy * 100} />
                  </div>
                </div>

                <Separator />

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <h4 className="text-sm font-medium mb-2">Top Performers ({report.top_performers.length})</h4>
                    <div className="flex flex-wrap gap-2">
                      {report.top_performers.map((studentId) => (
                        <Badge key={studentId} variant="default" className="bg-green-500">
                          <TrendingUp className="h-3 w-3 mr-1" />
                          {studentId}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h4 className="text-sm font-medium mb-2">Needs Support ({report.struggling_students.length})</h4>
                    <div className="flex flex-wrap gap-2">
                      {report.struggling_students.map((studentId) => (
                        <Badge key={studentId} variant="default" className="bg-yellow-500">
                          <AlertTriangle className="h-3 w-3 mr-1" />
                          {studentId}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="curriculum" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {dashboardData.coverage_reports.map((report, index) => (
              <Card key={index}>
                <CardHeader>
                  <CardTitle>{report.subject}</CardTitle>
                  <CardDescription>Curriculum progress</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Coverage</span>
                      <span className="font-medium">{report.coverage_percentage.toFixed(0)}%</span>
                    </div>
                    <Progress value={report.coverage_percentage} />
                  </div>

                  <Separator />

                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <div className="text-2xl font-bold">{report.total_topics}</div>
                      <div className="text-xs text-muted-foreground">Total</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-blue-500">{report.topics_covered}</div>
                      <div className="text-xs text-muted-foreground">Covered</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-green-500">{report.topics_mastered}</div>
                      <div className="text-xs text-muted-foreground">Mastered</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default EducatorDashboard;
