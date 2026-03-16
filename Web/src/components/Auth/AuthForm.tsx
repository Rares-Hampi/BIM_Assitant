import { Formik, Form, Field, ErrorMessage } from 'formik';
import * as Yup from 'yup';
import { FaEye, FaEyeSlash } from 'react-icons/fa';
import { useState } from 'react';
import './AuthForm.css';

interface AuthField {
  name: string;
  label: string;
  type: 'text' | 'email' | 'password';
  placeholder: string;
  icon: 'user' | 'email' | 'lock' | 'camera';
  validation: Yup.StringSchema;
}

interface AuthFormProps {
  type: 'login' | 'register';
  onSubmit: (values: Record<string, string | boolean>) => Promise<void>;
  isLoading?: boolean;
}


const AuthForm = ({ type, onSubmit, isLoading = false }: AuthFormProps) => {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Define fields based on form type
  const fields: AuthField[] = type === 'register' 
    ? [
        {
          name: 'name',
          label: 'Full Name',
          type: 'text',
          placeholder: 'John Doe',
          icon: 'user',
          validation: Yup.string().required('Full name is required').min(2, 'Name must be at least 2 characters')
        },
        {
          name: 'email',
          label: 'Company Email',
          type: 'email',
          placeholder: 'name@company.com',
          icon: 'email',
          validation: Yup.string().email('Invalid email address').required('Email is required')
        },
        {
          name: 'password',
          label: 'Password',
          type: 'password',
          placeholder: 'Min. 8 characters',
          icon: 'lock',
          validation: Yup.string().required('Password is required').min(8, 'Password must be at least 8 characters')
        }
      ]
    : [
        {
          name: 'email',
          label: 'Email',
          type: 'email',
          placeholder: 'name@company.com',
          icon: 'email',
          validation: Yup.string().email('Invalid email address').required('Email is required')
        },
        {
          name: 'password',
          label: 'Password',
          type: 'password',
          placeholder: 'Enter your password',
          icon: 'lock',
          validation: Yup.string().required('Password is required')
        }
      ];

  // Build validation schema
  const validationSchema = Yup.object(
    fields.reduce((acc, field) => ({
      ...acc,
      [field.name]: field.validation
    }), {})
  );

  // Initial values
  const initialValues: Record<string, string | boolean> = fields.reduce((acc, field) => ({
    ...acc,
    [field.name]: ''
  }), {} as Record<string, string | boolean>);

  return (
    <Formik
      initialValues={initialValues}
      validationSchema={validationSchema}
      onSubmit={onSubmit}
    >
      {({ errors, touched, isSubmitting }) => (
        <Form className="auth-form">
          {fields.map((field) => (
            <div key={field.name} className="form-group">
              <label htmlFor={field.name}>{field.label}</label>
              <div className="input-wrapper">
                
                <Field
                  type={
                    field.type === 'password'
                      ? field.name === 'password'
                        ? showPassword ? 'text' : 'password'
                        : showConfirmPassword ? 'text' : 'password'
                      : field.type
                  }
                  id={field.name}
                  name={field.name}
                  placeholder={field.placeholder}
                  className={errors[field.name] && touched[field.name] ? 'error' : ''}
                />
                {field.type === 'password' && (
                  <button
                    type="button"
                    className="toggle-password"
                    onClick={() => 
                      field.name === 'password' 
                        ? setShowPassword(!showPassword)
                        : setShowConfirmPassword(!showConfirmPassword)
                    }
                    tabIndex={-1}
                  >
                    {(field.name === 'password' ? showPassword : showConfirmPassword) ? (
                      <FaEyeSlash />
                    ) : (
                      <FaEye />
                    )}
                  </button>
                )}
              </div>
              <ErrorMessage name={field.name} component="div" className="field-error" />
            </div>
          ))}

          <button type="submit" className="btn-submit" disabled={isLoading || isSubmitting}>
            {isLoading || isSubmitting
              ? type === 'register' ? 'Creating Account...' : 'Signing In...'
              : type === 'register' ? 'Create Account' : 'Sign In'
            }
          </button>
        </Form>
      )}
    </Formik>
  );
};

export default AuthForm;
