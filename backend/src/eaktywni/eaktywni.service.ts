import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';

const BASE_URL = 'https://api.eaktywni.pl/tt-admin//EAktywni';
const OBJECT_IDS = '1243';

export interface LoginResult {
  sessionToken: string;
  tokenValidTo: string;
  userName: string;
}

export interface UserDataResult {
  objectId: number;
  email: string;
  firstName: string;
  lastName: string;
  name: string;
}

export interface Exercise {
  objectId: number;
  name: string;
  capacity: number;
  reserved: number;
  startTime: number;
  closeTime: number;
  saleFrom: number;
  saleTo: number;
  dayOfAWeek: string;
  zoneName: string;
  humanName: string;
  exerciseGroupName: string;
  assigned: boolean;
  waitList: boolean;
  waitListPosition: number;
  waitListCount: number;
  waitListQuantity: number;
  description: string;
  status: string;
}

export interface ExercisesResponse {
  result: Record<string, Exercise[]>;
  isError: boolean;
  errorTable: string[];
}

export interface EntryResponse {
  result: any;
  isError: boolean;
  errorTable: string[];
  messageType: string;
}

@Injectable()
export class EaktywniService {
  private readonly logger = new Logger(EaktywniService.name);

  private createClient(token?: string): AxiosInstance {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Origin': 'https://panel.eaktywni.pl',
      'Referer': 'https://panel.eaktywni.pl/',
      'Accept': '*/*',
      'Accept-Language': 'pl',
      'User-Agent':
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
    };
    if (token) {
      headers['X-Auth-User-Token'] = token;
    }
    return axios.create({ baseURL: BASE_URL, headers, timeout: 15000 });
  }

  async login(email: string, password: string): Promise<LoginResult> {
    const client = this.createClient();
    const { data } = await client.post('/login', {
      login: email,
      password,
      objectIds: OBJECT_IDS,
      old_token: '',
      rememberMe: false,
    });

    if (data.isError) {
      throw new Error(`Login failed: ${data.errorTable.join(', ')}`);
    }

    this.logger.log(`Logged in as ${data.result.userName}, token valid to ${data.result.tokenValidTo}`);
    return data.result;
  }

  async getUserData(token: string): Promise<UserDataResult> {
    const client = this.createClient(token);
    const { data } = await client.get('/user/data', {
      params: { objectIds: OBJECT_IDS },
    });

    if (data.isError) {
      throw new Error(`Failed to get user data: ${data.errorTable.join(', ')}`);
    }

    this.logger.log(`Got user data: objectId=${data.result.objectId}, name=${data.result.name}`);
    return data.result;
  }

  async getExercises(
    token: string,
    dateFrom: string,
    dateTo: string,
    userIds: string = '0',
  ): Promise<Record<string, Exercise[]>> {
    const client = this.createClient(token);
    const { data } = await client.get<ExercisesResponse>(
      `/exercises/fitness/datesAndFacility/V2`,
      {
        params: {
          objectIds: OBJECT_IDS,
          dateFrom,
          dateTo,
          exerciseGroupIds: '',
          zoneIds: '',
          humanIds: '',
          userIds,
        },
      },
    );

    if (data.isError) {
      throw new Error(`Failed to fetch exercises: ${data.errorTable.join(', ')}`);
    }

    return data.result;
  }

  async registerForExercise(
    token: string,
    exerciseId: number,
    webUserIds: string,
  ): Promise<{ data: EntryResponse; requestPayload: any }> {
    const client = this.createClient(token);
    const requestPayload = {
      url: `${BASE_URL}/exercises/fitness/entry?objectIds=${OBJECT_IDS}&passIds=null`,
      method: 'POST',
      body: {
        exerciseIds: exerciseId,
        webUserIds,
        assigned: false,
      },
    };
    const { data } = await client.post<EntryResponse>(
      `/exercises/fitness/entry?objectIds=${OBJECT_IDS}&passIds=null`,
      requestPayload.body,
    );

    if (data.isError) {
      this.logger.error(`Registration failed: ${data.errorTable.join(', ')}`);
    } else {
      this.logger.log(`Successfully registered for exercise ${exerciseId}`);
    }

    return { data, requestPayload };
  }
}
